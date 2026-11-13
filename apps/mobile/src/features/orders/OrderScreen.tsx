import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/Button';
import { ChevronLeftIcon, PlusIcon, SproutIcon } from '../../components/icons';
import { EmptyState, FloatingActionBar, Skeleton } from '../../components/parts';
import { color, extra, radius, type } from '../../components/theme';
import { useScreenInsets } from '../../components/useScreenInsets';
import { ReportLink } from '../safety/ReportLink';
import { errorCode } from '../../lib/backend/backend';
import type { OrderItem } from '../../lib/backend/types';
import { shortDate, weekdayLong } from '../../lib/dates';
import { currentLanguage } from '../../lib/i18n';
import { isOffline } from '../../lib/offlineCache';
import { OfflineBanner } from '../../components/OfflineBanner';
import { useNow } from '../../lib/useNow';
import { useAuth } from '../auth/useAuth';
import { newIdempotencyKey } from '../plans/queries';
import { amount, canChangeInterest, money, myEstimate, orderUnit, progress } from './orderRules';
import { useOrder, useSetInterest } from './queries';

const STEP = 1;
const MAX = 1000;

/**
 * A group order, as the GroupBuy design has it: eyebrow, title, the big progress number, who is in
 * and when it closes, the items with steppers, and the estimate bar. Interest is non-binding.
 * The steppers edit a draft; "Count me in" / "Update my amount" saves it, one item at a time.
 */
export default function OrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const insets = useScreenInsets();
  const router = useRouter();
  const { session } = useAuth();
  const order = useOrder(id);
  const setInterest = useSetInterest(id);
  const now = useNow();
  const keys = useRef(new Map<string, string>());
  const language = currentLanguage();
  const [draft, setDraft] = useState<Record<string, number>>({});
  const [saveError, setSaveError] = useState(false);

  // Once the cutoff passes the server derives a new state; fetch it rather than guess.
  const closesAt = order.data?.closesAt ?? null;
  const passed = closesAt !== null && now.getTime() >= Date.parse(closesAt);
  useEffect(() => {
    if (passed && (order.data?.state === 'collecting' || order.data?.state === 'extended')) {
      void order.refetch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [passed]);

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/home');
  };
  const circle = (label: string, onPress: () => void, child: React.ReactNode) => (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.circle}>
      {child}
    </Pressable>
  );

  if (order.isPending) {
    return (
      <View role="status" accessibilityLabel={t('common.loading')} aria-busy style={styles.screen}>
        <Skeleton width="100%" height={200} radius={radius.card} />
      </View>
    );
  }
  const offline = isOffline(order);
  if (order.isError && !offline) {
    const missing = errorCode(order.error) === 'not_found';
    return (
      <View style={styles.screen}>
        <EmptyState
          title={missing ? t('errors.notFoundTitle') : t('errors.serverTitle')}
          text={missing ? t('errors.notFoundText') : t('errors.serverText')}
          actions={
            missing ? (
              <Button label={t('common.backToHome')} onPress={() => { router.replace('/home'); }} />
            ) : (
              <Button label={t('common.retry')} onPress={() => void order.refetch()} />
            )
          }
        />
      </View>
    );
  }

  const data = order.data as NonNullable<typeof order.data>;
  const unit = orderUnit(data);
  const open = canChangeInterest(data, now) && !offline;
  const organizer = session?.userId === data.organizerId;
  const tz = data.timezone;
  const hasInterest = data.items.some((i) => i.mine > 0);
  const closesLabel = shortDate(data.closesAt, tz);
  const pickupLabel = weekdayLong(data.pickupStart, tz);
  const quantity = (item: OrderItem) => draft[item.id] ?? item.mine;
  const shown = data.items.map((i) => ({ ...i, mine: quantity(i) }));
  const estimate = myEstimate(shown);
  const changed = data.items.filter((i) => quantity(i) !== i.mine);

  const change = (item: OrderItem, next: number) => {
    if (!session) {
      router.push({ pathname: '/sign-up', params: { next: `/order/${data.id}` } });
      return;
    }
    setSaveError(false);
    setDraft((d) => ({ ...d, [item.id]: Math.max(0, Math.min(MAX, next)) }));
  };

  // Saves every changed item in turn; a retry reuses the key of each attempt.
  const save = async () => {
    if (!session) {
      router.push({ pathname: '/sign-up', params: { next: `/order/${data.id}` } });
      return;
    }
    setSaveError(false);
    try {
      for (const item of changed) {
        const attempt = `${item.id}:${quantity(item)}`;
        const key = keys.current.get(attempt) ?? newIdempotencyKey();
        keys.current.set(attempt, key);
        await setInterest.mutateAsync({ itemId: item.id, quantity: quantity(item), key });
        keys.current.delete(attempt);
      }
      setDraft({});
    } catch {
      setSaveError(true);
    }
  };

  const statusLine = () => {
    switch (data.state) {
      case 'below_target':
        return organizer ? null : t('order.organizerDecide', { name: data.organizerName });
      case 'locked':
        return t('order.stateLocked');
      case 'ready':
        return t('order.stateReady');
      case 'completed':
        return t('order.stateCompleted');
      case 'cancelled':
        return t('order.stateCancelled');
      default:
        return open ? null : t('order.closed', { when: closesLabel });
    }
  };

  const barAction = () => {
    if (data.state === 'below_target' && organizer) {
      return (
        <Button
          label={t('order.decideTitle')}
          onPress={() => { router.push({ pathname: '/order/[id]/decide', params: { id: data.id } }); }}
        />
      );
    }
    if (data.state === 'locked' && organizer) {
      return (
        <Button
          label={t('order.readyTitle')}
          onPress={() => { router.push({ pathname: '/order/[id]/decide', params: { id: data.id } }); }}
        />
      );
    }
    if ((data.state === 'ready' || data.state === 'locked' || data.state === 'completed') && (hasInterest || organizer)) {
      return (
        <Button
          label={t('order.openPickup')}
          onPress={() => { router.push({ pathname: '/order/[id]/pickup', params: { id: data.id } }); }}
        />
      );
    }
    if (open) {
      return (
        <Button
          label={hasInterest ? t('order.update') : t('order.join')}
          disabled={session !== null && changed.length === 0}
          loading={setInterest.isPending}
          onPress={() => { void save(); }}
        />
      );
    }
    return <Button variant="outline" label={t('common.back')} onPress={goBack} />;
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.headerTop, paddingBottom: 170 + insets.bottom }]}
        {...(Platform.OS === 'web' ? { tabIndex: 0 as const } : {})}
      >
        {offline ? <OfflineBanner savedAt={order.dataUpdatedAt} /> : null}
        <View style={styles.topRow}>
          {circle(t('common.back'), goBack, <ChevronLeftIcon strokeWidth={2.2} color={color.ink} />)}
          {circle(
            t('create.published.share'),
            () => {
              void Share.share({ message: `https://plantcircle.app/p/${data.id}` }).catch(() => undefined);
            },
            <PlusIcon strokeWidth={2.2} color={color.ink} />,
          )}
        </View>

        <View style={styles.head}>
          <Text style={type(13, 'semibold', { color: color.secondary, tracking: 0.6 })}>
            {t('order.eyebrow', { name: data.organizerName.toUpperCase() })}
          </Text>
          <Text accessibilityRole="header" style={type(32, 'bold', { tracking: -1, leading: 1.06 })}>
            {data.title}
          </Text>
        </View>

        <View style={styles.progressBlock}>
          <Text
            accessibilityLabel={`${amount(data.interestTotal, unit, language)} ${t('order.ofTarget', { target: data.targetTotal, unit })}`}
            style={type(52, 'bold', { tracking: -2, leading: 1 })}
          >
            {new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(data.interestTotal)}
            <Text style={type(20, 'medium', { color: color.secondary, tracking: -0.3 })}>
              {` ${t('order.ofTarget', { target: data.targetTotal, unit })}`}
            </Text>
          </Text>
          <View
            role="progressbar"
            accessibilityLabel={t('order.groupTarget')}
            accessibilityValue={{ min: 0, max: 100, now: Math.round(progress(data) * 100) }}
            style={styles.track}
          >
            <View style={[styles.fill, { width: `${progress(data) * 100}%` }]} />
          </View>
          <Text style={type(15, 'regular', { color: color.secondary })}>
            {t('order.meta', { count: data.peopleCount, closes: closesLabel, pickup: pickupLabel })}
          </Text>
          {data.description ? (
            <View style={styles.note}>
              <SproutIcon size={18} strokeWidth={1.8} color={color.brand} />
              <Text style={[type(15, 'medium', { color: color.brand }), styles.noteText]}>{data.description}</Text>
            </View>
          ) : null}
          {statusLine() ? (
            <Text role="status" style={type(15, 'semibold', { color: color.ink })}>{statusLine()}</Text>
          ) : null}
        </View>

        <View>
          <Text accessibilityRole="header" style={type(20, 'bold', { tracking: -0.5 })}>
            {t('order.howMuch')}
          </Text>
          {shown.map((item) => (
            <View key={item.id} style={styles.item}>
              <View style={styles.itemText}>
                <Text style={type(17, 'semibold')}>{item.name}</Text>
                <Text style={type(14, 'regular', { color: color.secondary })}>
                  {item.estPriceMinor !== null
                    ? `${money(item.estPriceMinor, item.currency, language)} / ${item.unit}`
                    : amount(item.interestTotal, item.unit, language)}
                </Text>
              </View>
              {open ? (
                <View style={styles.stepper}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${t('order.less')} ${item.name}`}
                    disabled={item.mine <= 0 || setInterest.isPending}
                    onPress={() => { change(item, item.mine - STEP); }}
                    style={[styles.stepButton, item.mine <= 0 && styles.disabled]}
                  >
                    <Text style={type(19, 'regular')}>−</Text>
                  </Pressable>
                  <Text accessibilityLiveRegion="polite" style={[type(16, 'semibold'), styles.qty]}>
                    {amount(item.mine, item.unit, language)}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${t('order.more')} ${item.name}`}
                    disabled={setInterest.isPending}
                    onPress={() => { change(item, item.mine + STEP); }}
                    style={styles.stepButton}
                  >
                    <Text style={type(19, 'regular')}>+</Text>
                  </Pressable>
                </View>
              ) : (
                <Text style={type(16, 'semibold')}>{amount(item.mine, item.unit, language)}</Text>
              )}
            </View>
          ))}
          {saveError ? (
            <Text role="alert" style={type(14, 'regular', { color: color.danger })}>
              {errorCode(setInterest.error) === 'interest_closed'
                ? t('order.interestClosed')
                : errorCode(setInterest.error) === 'suspended'
                  ? t('safety.suspendedErrorDetail')
                  : t('order.error')}
            </Text>
          ) : null}
        </View>

        <Text style={type(13, 'regular', { color: color.secondary, leading: 1.5 })}>
          {t('order.notPurchase', { name: data.organizerName })}
        </Text>
        {organizer ? null : <ReportLink targetType="order" targetId={data.id} name={data.title} userId={data.organizerId} />}
      </ScrollView>

      <FloatingActionBar style={styles.bar}>
        <View style={styles.barText}>
          <Text style={type(18, 'bold', { tracking: -0.3 })}>
            {estimate ? t('order.estimate', { amount: money(estimate.minor, estimate.currency, language) }) : amount(shown.reduce((a, i) => a + i.mine, 0), unit, language)}
          </Text>
          <Text style={type(14, 'regular', { color: color.secondary })}>{t('order.estimateLabel')}</Text>
        </View>
        {barAction()}
      </FloatingActionBar>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface },
  content: { paddingHorizontal: 24, gap: 30 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between' },
  circle: { width: 44, height: 44, borderRadius: 22, backgroundColor: color.fill, alignItems: 'center', justifyContent: 'center' },
  head: { gap: 10 },
  progressBlock: { gap: 12 },
  track: { height: 6, borderRadius: 3, backgroundColor: extra.skeleton, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3, backgroundColor: color.brand },
  note: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  noteText: { flex: 1 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: color.fill,
  },
  itemText: { flex: 1, minWidth: 0, gap: 2 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  stepButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: color.fill, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.4 },
  qty: { minWidth: 52, textAlign: 'center' },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 14, paddingVertical: 10, paddingLeft: 20, paddingRight: 10 },
  barText: { flex: 1, minWidth: 0, gap: 1 },
});

import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/Button';
import { errorCode } from '../../lib/backend/backend';
import { ScreenHeader } from '../../components/ScreenHeader';
import { EmptyState, FloatingActionBar, InlineState, Skeleton } from '../../components/parts';
import { useAuth } from '../auth/useAuth';
import { color, extra, radius, type } from '../../components/theme';
import { useScreenInsets } from '../../components/useScreenInsets';
import type { OrderDecision } from '../../lib/backend/types';
import { shortDate } from '../../lib/dates';
import { currentLanguage } from '../../lib/i18n';
import { newIdempotencyKey } from '../plans/queries';
import { amount, orderUnit, progress } from './orderRules';
import { useDecideOrder, useOrder } from './queries';

/**
 * The organizer's decision on an order, as the OrderShort design has it: the closed pill, the big
 * number against the target, and three choices (go ahead, three more days, cancel). A locked order
 * offers only "ready for pickup".
 */
export default function DecideScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const insets = useScreenInsets();
  const router = useRouter();
  const { session } = useAuth();
  const order = useOrder(id);
  const decide = useDecideOrder(id);
  const [choice, setChoice] = useState<OrderDecision | null>(null);
  // One key per decision for this visit: a retry of the same choice replays it.
  const [keys] = useState(() => new Map<OrderDecision, string>());
  const language = currentLanguage();

  const back = () => {
    if (router.canGoBack()) router.back();
    else router.replace({ pathname: '/order/[id]', params: { id } });
  };

  if (order.isPending) {
    return (
      <View
        role="status"
        accessibilityLabel={t('common.loading')}
        aria-busy
        style={styles.screen}
      >
        <Skeleton width="100%" height={200} radius={radius.card} />
      </View>
    );
  }
  if (order.isError) {
    return (
      <View style={styles.screen}>
        <ScreenHeader backLabel={t('common.back')} onBack={back} />
        <EmptyState
          {...(errorCode(order.error) === 'not_found'
            ? {}
            : {
                onSavedPlans: () => {
                  router.push('/my-plans');
                },
              })}
          title={t('errors.serverTitle')}
          text={t('errors.serverText')}
          actions={<Button label={t('common.retry')} onPress={() => void order.refetch()} />}
        />
      </View>
    );
  }

  const data = order.data;
  const unit = orderUnit(data);
  const tz = data.timezone;
  if (!session) {
    return (
      <View style={styles.screen}>
        <ScreenHeader backLabel={t('common.back')} onBack={back} />
        <InlineState
          title={t('people.signedOut.title')}
          text={t('order.signedOut')}
          action={
            <Button
              variant="outline"
              label={t('home.signIn')}
              onPress={() => {
                router.push({ pathname: '/sign-up', params: { next: `/order/${id}/decide` } });
              }}
            />
          }
        />
      </View>
    );
  }
  // Only the organizer decides, and only while there is something to decide.
  const decidable = data.state === 'below_target' || data.state === 'locked';
  if (session.userId !== data.organizerId || !decidable) {
    return (
      <View style={styles.screen}>
        <ScreenHeader backLabel={t('common.back')} onBack={back} />
        <EmptyState
          title={
            session.userId !== data.organizerId
              ? t('errors.notFoundTitle')
              : t(
                  `order.state${data.state === 'below_target' ? 'Below' : data.state.charAt(0).toUpperCase() + data.state.slice(1)}`,
                )
          }
          text={
            session.userId !== data.organizerId
              ? t('errors.notFoundText')
              : t('order.decidedText')
          }
          actions={<Button label={t('common.back')} onPress={back} />}
        />
      </View>
    );
  }
  const options: { value: OrderDecision; title: string; lead: string }[] =
    data.state === 'locked'
      ? [{ value: 'ready', title: t('order.readyTitle'), lead: t('order.readyLead') }]
      : [
          // Going ahead needs someone in; otherwise only extending or cancelling makes sense.
          ...(data.peopleCount > 0
            ? [
                {
                  value: 'go' as const,
                  title: t('order.goTitle', {
                    amount: amount(data.interestTotal, unit, language),
                  }),
                  lead: t('order.goLead'),
                },
              ]
            : []),
          ...(data.extendedOnce
            ? []
            : [
                {
                  value: 'extend' as const,
                  title: t('order.extendTitle'),
                  lead: t('order.extendLead', {
                    until: shortDate(new Date(Date.now() + 72 * 3_600_000).toISOString(), tz),
                  }),
                },
              ]),
          { value: 'cancel', title: t('order.cancelTitle'), lead: t('order.cancelLead') },
        ];

  const confirm = () => {
    if (!choice) return;
    const key = keys.get(choice) ?? newIdempotencyKey();
    keys.set(choice, key);
    decide.mutate(
      { decision: choice, key },
      {
        onSuccess: () => {
          router.replace({ pathname: '/order/[id]', params: { id } });
        },
      },
    );
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader backLabel={t('common.back')} onBack={back} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: 170 + insets.bottom }]}
      >
        <View style={styles.pillWrap}>
          <Text style={[type(13, 'bold', { color: '#6B4000', tracking: 0.3 }), styles.pill]}>
            {data.state === 'locked'
              ? t('order.stateLocked').toUpperCase()
              : t('order.interestClosed').toUpperCase()}
          </Text>
        </View>
        <Text style={type(52, 'bold', { tracking: -2, leading: 1 })}>
          {new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(
            data.interestTotal,
          )}
          <Text style={type(22, 'medium', { color: color.secondary, tracking: -0.3 })}>
            {` ${t('order.ofTarget', { target: data.targetTotal, unit })}`}
          </Text>
        </Text>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${progress(data) * 100}%` }]} />
        </View>
        <Text style={type(17, 'regular', { color: color.secondary, leading: 1.5 })}>
          {`${t('order.decideLead', { count: data.peopleCount })} ${t('order.decideTitle')}`}
        </Text>
        <View accessibilityRole="radiogroup" style={styles.options}>
          {options.map((option) => {
            const selected = choice === option.value;
            return (
              <Pressable
                key={option.value}
                accessibilityRole="radio"
                aria-checked={selected}
                onPress={() => {
                  setChoice(option.value);
                }}
                style={[styles.option, selected && styles.optionSelected]}
              >
                <Text style={type(17, 'semibold')}>{option.title}</Text>
                <Text style={type(15, 'regular', { color: color.secondary, leading: 1.45 })}>
                  {option.lead}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {decide.isError ? (
          <Text role="alert" style={type(15, 'regular', { color: color.danger })}>
            {t('order.error')}
          </Text>
        ) : null}
      </ScrollView>
      <FloatingActionBar style={styles.bar}>
        <View style={styles.barText}>
          <Text style={type(16, 'semibold')}>
            {choice ? options.find((o) => o.value === choice)?.title : t('order.decideTitle')}
          </Text>
          <Text style={type(14, 'regular', { color: color.secondary })}>
            {t('order.notified')}
          </Text>
        </View>
        <Button
          label={t('order.confirm')}
          disabled={!choice}
          loading={decide.isPending}
          onPress={confirm}
        />
      </FloatingActionBar>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface },
  content: { paddingHorizontal: 24, paddingTop: 14, gap: 14 },
  pillWrap: { flexDirection: 'row' },
  pill: {
    minHeight: 28,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: '#FFF6E5',
    overflow: 'hidden',
  },
  track: { height: 8, borderRadius: 4, backgroundColor: extra.cardBorder, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4, backgroundColor: '#6B4000' },
  options: { gap: 10, paddingTop: 8 },
  option: {
    gap: 3,
    padding: 16,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: extra.cardBorder,
  },
  optionSelected: { borderColor: color.ink, backgroundColor: color.fill },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
    paddingVertical: 10,
    paddingLeft: 20,
    paddingRight: 10,
  },
  barText: { flex: 1, minWidth: 0, gap: 1 },
});

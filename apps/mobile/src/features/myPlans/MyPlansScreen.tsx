import { useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/Button';
import { ChevronRightIcon, OfflineIcon, PlusIcon } from '../../components/icons';
import { DateTile, EmptyState, Skeleton } from '../../components/parts';
import { color, extra, radius, size, type } from '../../components/theme';
import { useScreenInsets } from '../../components/useScreenInsets';
import { errorCode } from '../../lib/backend/backend';
import type { MyPlan } from '../../lib/backend/types';
import { shortDate, time, weekdayShort } from '../../lib/dates';
import { useAuth } from '../auth/useAuth';
import { useMyPlans } from '../plans/queries';
import { statusPill, type MyPlansTab, type PillTone } from './myPlanRules';

const TABS: MyPlansTab[] = ['going', 'hosting', 'past'];

const TONE: Record<PillTone, { background: string; text: string }> = {
  positive: { background: color.brandTint, text: color.brand },
  neutral: { background: color.fill, text: color.secondary },
  attention: { background: color.warningTint, text: color.warning },
};

function PlanRow({
  item,
  isPast,
  onPress,
}: {
  item: MyPlan;
  isPast: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const { plan } = item;
  const tz = plan.timezone;
  const when = isPast
    ? shortDate(plan.startsAt, tz)
    : `${weekdayShort(plan.startsAt, tz)} ${time(plan.startsAt, tz)} · ${plan.areaName}`;
  const pill = statusPill(t, item, isPast);
  return (
    <Pressable accessibilityRole="link" onPress={onPress} style={styles.row}>
      <View style={styles.rowTop}>
        <DateTile iso={plan.startsAt} timeZone={tz} />
        <View style={styles.rowText}>
          <Text style={type(17, 'semibold', { tracking: -0.3 })}>{plan.title}</Text>
          <Text style={type(15, 'regular', { color: color.secondary })}>{when}</Text>
        </View>
        <ChevronRightIcon size={16} strokeWidth={2.4} color={color.borderControl} />
      </View>
      <View style={styles.pills}>
        <View style={[styles.pill, { backgroundColor: TONE[pill.tone].background }]}>
          <Text style={type(14, 'semibold', { color: TONE[pill.tone].text })}>
            {pill.label}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

/** Centred message inside a tab: the tab itself stays usable. */
function TabMessage({
  title,
  text,
  action,
}: {
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <View style={styles.message}>
      <Text accessibilityRole="header" style={type(22, 'bold', { tracking: -0.5 })}>
        {title}
      </Text>
      <Text style={type(16, 'regular', { color: color.secondary, leading: 1.5 })}>{text}</Text>
      {action}
    </View>
  );
}

function ListSkeleton() {
  const { t } = useTranslation();
  return (
    <View role="status" accessibilityLabel={t('common.loading')} aria-busy style={styles.list}>
      <Skeleton width="100%" height={110} radius={radius.card} />
      <Skeleton width="100%" height={110} radius={radius.card} />
    </View>
  );
}

export default function MyPlansScreen() {
  const router = useRouter();
  const insets = useScreenInsets();
  const { t } = useTranslation();
  const { session, isLoading: authLoading } = useAuth();
  const [tab, setTab] = useState<MyPlansTab>('going');
  const upcoming = useMyPlans('upcoming', tab === 'going');
  const past = useMyPlans('past', tab === 'past');
  const query = tab === 'past' ? past : upcoming;

  const openPlan = (item: MyPlan) => {
    router.push({ pathname: '/plan/[id]', params: { id: item.plan.id } });
  };

  function renderContent() {
    if (authLoading) return <ListSkeleton />;
    if (!session) {
      return (
        <TabMessage
          title={t('myPlans.signedOutTitle')}
          text={t('myPlans.signedOutText')}
          action={
            <Button
              label={t('home.signIn')}
              onPress={() => {
                router.push('/sign-up');
              }}
            />
          }
        />
      );
    }
    if (tab === 'hosting') {
      return (
        <TabMessage
          title={t('myPlans.hostingEmpty.title')}
          text={t('myPlans.hostingEmpty.text')}
          action={
            <Button
              label={t('home.startPlan')}
              onPress={() => {
                router.push('/create');
              }}
            />
          }
        />
      );
    }
    if (query.isPending) return <ListSkeleton />;
    if (query.isError) {
      const offline = errorCode(query.error) === 'network';
      return (
        <EmptyState
          title={offline ? t('errors.offlineTitle') : t('errors.serverTitle')}
          text={offline ? t('errors.offlineText') : t('errors.serverText')}
          {...(offline ? { icon: <OfflineIcon size={36} strokeWidth={1.7} /> } : {})}
          actions={<Button label={t('common.tryAgain')} onPress={() => void query.refetch()} />}
        />
      );
    }
    if (query.data.length === 0) {
      return tab === 'past' ? (
        <TabMessage title={t('myPlans.pastEmpty.title')} text={t('myPlans.pastEmpty.text')} />
      ) : (
        <TabMessage
          title={t('myPlans.upcomingEmpty.title')}
          text={t('myPlans.upcomingEmpty.text')}
        />
      );
    }
    return (
      <View style={styles.list}>
        {query.data.map((item) => (
          <PlanRow
            key={item.plan.id}
            item={item}
            isPast={tab === 'past'}
            onPress={() => {
              openPlan(item);
            }}
          />
        ))}
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top, paddingBottom: 130 + insets.bottom },
      ]}
      style={styles.screen}
    >
      <View style={styles.header}>
        <Text accessibilityRole="header" style={type(34, 'bold', { tracking: -1.1 })}>
          {t('tabs.myPlans')}
        </Text>
        <Pressable
          accessibilityRole="link"
          onPress={() => {
            router.push('/create');
          }}
          style={styles.createButton}
        >
          <PlusIcon size={16} strokeWidth={2.6} color={color.surface} />
          <Text style={type(15, 'semibold', { color: color.surface })}>
            {t('myPlans.create')}
          </Text>
        </Pressable>
      </View>

      <View accessibilityRole="tablist" style={styles.segments}>
        {TABS.map((key) => {
          const selected = tab === key;
          return (
            <Pressable
              key={key}
              accessibilityRole="tab"
              aria-selected={selected}
              onPress={() => {
                setTab(key);
              }}
              style={[styles.segment, selected && styles.segmentSelected]}
            >
              <Text
                style={type(15, selected ? 'semibold' : 'medium', {
                  color: selected ? color.ink : color.secondary,
                })}
              >
                {t(`myPlans.tabs.${key}`)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {renderContent()}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface },
  content: { paddingHorizontal: 20, gap: 18 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: size.touchMin,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    backgroundColor: color.ink,
  },
  segments: {
    flexDirection: 'row',
    gap: 4,
    padding: 4,
    borderRadius: 14,
    backgroundColor: color.fill,
  },
  segment: {
    flex: 1,
    minHeight: size.touchMin,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 11,
  },
  segmentSelected: { backgroundColor: color.surface },
  list: { gap: 12 },
  row: {
    gap: 12,
    padding: 14,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: extra.cardBorder,
    backgroundColor: color.surface,
  },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  rowText: { flex: 1, minWidth: 0, gap: 3 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: {
    minHeight: 30,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: radius.pill,
  },
  message: { alignItems: 'center', gap: 10, paddingVertical: 36, paddingHorizontal: 16 },
});

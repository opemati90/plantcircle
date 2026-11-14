import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/Button';
import { OfflineIcon, PlusIcon } from '../../components/icons';
import { EmptyState, InlineState, Skeleton } from '../../components/parts';
import { color, radius, size, type } from '../../components/theme';
import { useScreenInsets } from '../../components/useScreenInsets';
import { errorCode } from '../../lib/backend/backend';
import type { MyPlan } from '../../lib/backend/types';
import { shortDate, time, weekdayShort } from '../../lib/dates';
import { placeLabel } from '../plans/planCopy';
import { PlanListItem } from '../plans/PlanListItem';
import { useAuth } from '../auth/useAuth';
import { OfflineBanner } from '../../components/OfflineBanner';
import { isOffline } from '../../lib/offlineCache';
import { useQueryClient } from '@tanstack/react-query';
import { useBackend } from '../../lib/backend/BackendProvider';
import { useMyPlans } from '../plans/queries';
import { statusPill, type MyPlansTab } from './myPlanRules';

const TABS: MyPlansTab[] = ['going', 'hosting', 'past'];

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
  // Each joined Plan is fetched once here, so its details are saved for offline even unopened.
  const queryClient = useQueryClient();
  const backend = useBackend();
  useEffect(() => {
    for (const item of upcoming.data ?? []) {
      const key = ['plan', item.plan.id, session?.userId ?? null];
      if (queryClient.getQueryData(key) !== undefined) continue;
      // eslint-disable-next-line @typescript-eslint/no-deprecated -- queryClient.query() is not in this release yet
      void queryClient.prefetchQuery({
        queryKey: key,
        queryFn: () => backend.getPlan(item.plan.id),
        staleTime: 60_000,
      });
    }
  }, [upcoming.data, queryClient, backend, session?.userId]);

  // A held spot goes straight to its offer; everything else opens the Plan.
  const openPlan = (item: MyPlan) => {
    if (item.rsvp === 'offered') {
      router.push({ pathname: '/plan/[id]/waitlist-offer', params: { id: item.plan.id } });
      return;
    }
    router.push({ pathname: '/plan/[id]', params: { id: item.plan.id } });
  };

  function renderContent() {
    if (authLoading) return <ListSkeleton />;
    if (!session) {
      return (
        <InlineState
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
        <InlineState
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
    // A saved copy is better than an error, whatever the failure was.
    if (query.isError && query.data === undefined) {
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
    const rows = query.data;
    if (rows.length === 0) {
      return tab === 'past' ? (
        <InlineState title={t('myPlans.pastEmpty.title')} text={t('myPlans.pastEmpty.text')} />
      ) : (
        <InlineState
          title={t('myPlans.upcomingEmpty.title')}
          text={t('myPlans.upcomingEmpty.text')}
        />
      );
    }
    return (
      <View style={styles.list}>
        {rows.map((item) => {
          const isPast = tab === 'past';
          const { plan } = item;
          const when = isPast
            ? shortDate(plan.startsAt, plan.timezone)
            : `${weekdayShort(plan.startsAt, plan.timezone)} ${time(plan.startsAt, plan.timezone)} · ${placeLabel(t, plan)}`;
          return (
            <PlanListItem
              key={plan.id}
              plan={plan}
              when={when}
              pill={statusPill(t, item, isPast)}
              onPress={() => {
                openPlan(item);
              }}
            />
          );
        })}
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
      {isOffline(query) ? <OfflineBanner savedAt={query.dataUpdatedAt} /> : null}
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
});

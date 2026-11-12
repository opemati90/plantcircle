import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Button, IconButton } from '../../components/Button';
import { ChevronRightIcon, CloseIcon, OfflineIcon } from '../../components/icons';
import { EmptyState, FloatingActionBar, Skeleton, Toast } from '../../components/parts';
import { Photo } from '../../components/Photo';
import { color, extra, radius, type } from '../../components/theme';
import { useScreenInsets } from '../../components/useScreenInsets';
import { errorCode } from '../../lib/backend/backend';
import type { OfferOutcome, PlanDetail } from '../../lib/backend/types';
import { isToday, localTime, localWeekdayTime, shortDate, time } from '../../lib/dates';
import { offerFraction, timeLeft } from './planCopy';
import { planImage } from './planImage';
import { newIdempotencyKey, usePlan, useRsvpMutations } from './queries';

const RING = 200;
const STROKE = 12;
const RADIUS = (RING - STROKE * 2) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** Re-renders on an interval so the countdown stays current. */
function useNow(everyMs: number): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, everyMs);
    return () => {
      clearInterval(timer);
    };
  }, [everyMs]);
  return now;
}

function CountdownRing({ expiresAt, now }: { expiresAt: string; now: Date }) {
  const { t } = useTranslation();
  const left = timeLeft(expiresAt, now);
  const offset = CIRCUMFERENCE * (1 - offerFraction(expiresAt, now));
  return (
    <View
      role="timer"
      accessibilityLabel={t('offer.timerLabel', { time: left })}
      style={styles.ring}
    >
      <Svg width={RING} height={RING} viewBox={`0 0 ${RING} ${RING}`} aria-hidden>
        <Circle
          cx={RING / 2}
          cy={RING / 2}
          r={RADIUS}
          fill="none"
          stroke={color.brandTint}
          strokeWidth={STROKE}
        />
        <Circle
          cx={RING / 2}
          cy={RING / 2}
          r={RADIUS}
          fill="none"
          stroke={color.brand}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
        />
      </Svg>
      <View aria-hidden style={styles.ringText}>
        <Text
          allowFontScaling={false}
          style={[type(40, 'bold', { tracking: -1.4 }), styles.tabular]}
        >
          {left}
        </Text>
        <Text style={type(15, 'regular', { color: color.secondary })}>
          {t('offer.leftToConfirm')}
        </Text>
      </View>
    </View>
  );
}

function OfferView({ detail }: { detail: PlanDetail }) {
  const { plan, rsvp, offerExpiresAt } = detail;
  const router = useRouter();
  const insets = useScreenInsets();
  const { t } = useTranslation();
  const now = useNow(15_000);
  const { confirmOffer, cancel, joinWaitlist } = useRsvpMutations(plan.id);
  const [outcome, setOutcome] = useState<OfferOutcome | null>(null);

  const toPlan = () => {
    router.dismissTo({ pathname: '/plan/[id]', params: { id: plan.id } });
  };

  const live = rsvp === 'offered' && offerExpiresAt !== null && new Date(offerExpiresAt) > now;
  // The server's answer wins; otherwise an offer whose time ran out on screen has expired.
  const ended: OfferOutcome | 'none' | null =
    outcome && outcome !== 'going'
      ? outcome
      : live
        ? null
        : rsvp === 'offered'
          ? 'expired'
          : rsvp === 'waitlisted'
            ? 'waitlisted'
            : 'none';

  useEffect(() => {
    if (outcome === 'going' || rsvp === 'going') toPlan();
    // `toPlan` is new every render; navigating once per state change is intended.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outcome, rsvp]);

  if (ended) {
    const expired = ended === 'expired';
    return (
      <EmptyState
        title={
          expired
            ? t('offer.expiredTitle')
            : ended === 'waitlisted'
              ? t('offer.takenTitle')
              : t('offer.noneTitle')
        }
        text={
          expired
            ? t('offer.expiredText')
            : ended === 'waitlisted'
              ? t('offer.takenText')
              : t('offer.noneText')
        }
        actions={
          <>
            {expired ? (
              <Button
                label={t('offer.backToWaitlist')}
                loading={joinWaitlist.isPending}
                onPress={() => {
                  joinWaitlist.mutate(joinWaitlist.variables ?? newIdempotencyKey(), {
                    onSuccess: toPlan,
                  });
                }}
              />
            ) : null}
            <Button
              variant={expired ? 'ghost' : 'primary'}
              label={t('offer.backToPlan')}
              onPress={toPlan}
            />
            {joinWaitlist.isError ? (
              <Text role="alert" style={type(15, 'regular', { color: color.danger })}>
                {t('plan.error.genericTitle')}
              </Text>
            ) : null}
          </>
        }
      />
    );
  }

  // `live` guarantees an expiry time; the guard keeps the types honest.
  if (!offerExpiresAt) return null;

  const deadline = isToday(offerExpiresAt, now)
    ? t('offer.today', { time: localTime(offerExpiresAt) })
    : localWeekdayTime(offerExpiresAt);
  const failed = confirmOffer.isError ? confirmOffer : cancel.isError ? cancel : null;
  const meta = [
    shortDate(plan.startsAt, plan.timezone),
    time(plan.startsAt, plan.timezone),
    plan.areaName,
  ].join(' · ');

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.headerTop }]}>
        <View style={styles.row}>
          <IconButton label={t('common.close')} onPress={toPlan}>
            <CloseIcon strokeWidth={2.2} />
          </IconButton>
        </View>
        <CountdownRing expiresAt={offerExpiresAt} now={now} />
        <Text
          accessibilityRole="header"
          style={[type(30, 'bold', { tracking: -0.9, leading: 1.1 }), styles.title]}
        >
          {t('offer.title')}
        </Text>
        <Text
          style={[type(17, 'regular', { color: color.secondary, leading: 1.5 }), styles.lead]}
        >
          {t('offer.text', { when: deadline })}
        </Text>
        <Pressable accessibilityRole="link" onPress={toPlan} style={styles.card}>
          <View style={styles.thumb}>
            <Photo source={planImage(plan)} />
          </View>
          <View style={styles.cardText}>
            <Text style={type(17, 'semibold', { tracking: -0.3 })}>{plan.title}</Text>
            <Text style={type(15, 'regular', { color: color.secondary })}>{meta}</Text>
          </View>
          <ChevronRightIcon size={16} strokeWidth={2.4} color={color.borderControl} />
        </Pressable>
      </ScrollView>

      {failed ? (
        <Toast
          tone="alert"
          title={t('plan.error.genericTitle')}
          detail={t('plan.error.genericDetail')}
          icon={<OfflineIcon size={20} color="#FFFFFF" />}
          {...(errorCode(failed.error) === 'no_offer'
            ? {}
            : {
                action: {
                  label: t('common.retry'),
                  // Same idempotency key: a retry can never confirm or cancel twice.
                  onPress: () => {
                    if (failed === confirmOffer && confirmOffer.variables) {
                      confirmOffer.mutate(confirmOffer.variables, { onSuccess: setOutcome });
                    } else if (cancel.variables) {
                      cancel.mutate(cancel.variables, { onSuccess: toPlan });
                    }
                  },
                },
              })}
        />
      ) : null}

      <FloatingActionBar style={styles.bar}>
        <Button
          label={t('plan.confirmSpot')}
          loading={confirmOffer.isPending}
          disabled={cancel.isPending}
          onPress={() => {
            confirmOffer.mutate(newIdempotencyKey(), { onSuccess: setOutcome });
          }}
        />
        <Button
          variant="ghost"
          label={t('offer.pass')}
          disabled={confirmOffer.isPending || cancel.isPending}
          onPress={() => {
            cancel.mutate(newIdempotencyKey(), { onSuccess: toPlan });
          }}
        />
      </FloatingActionBar>
    </View>
  );
}

export default function WaitlistOfferScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t } = useTranslation();
  const plan = usePlan(id);

  if (plan.isPending) {
    return (
      <View
        role="status"
        accessibilityLabel={t('common.loading')}
        aria-busy
        style={styles.loading}
      >
        <Skeleton width={RING} height={RING} radius={RING / 2} />
        <Skeleton width="80%" height={34} radius={8} />
        <Skeleton width="100%" height={88} radius={radius.card} />
      </View>
    );
  }

  if (plan.isError) {
    const offline = errorCode(plan.error) === 'network';
    return (
      <EmptyState
        title={offline ? t('errors.offlineTitle') : t('errors.serverTitle')}
        text={offline ? t('errors.offlineText') : t('errors.serverText')}
        actions={
          <>
            <Button label={t('common.tryAgain')} onPress={() => void plan.refetch()} />
            <Button
              variant="ghost"
              label={t('common.backToHome')}
              onPress={() => {
                router.replace('/home');
              }}
            />
          </>
        }
      />
    );
  }

  return <OfferView detail={plan.data} />;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface },
  content: { paddingHorizontal: 24, paddingBottom: 190 },
  row: { flexDirection: 'row' },
  ring: { width: RING, height: RING, alignSelf: 'center', marginTop: 18 },
  ringText: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  tabular: { fontVariant: ['tabular-nums'] },
  title: { marginTop: 26, textAlign: 'center' },
  lead: { marginTop: 10, marginBottom: 26, textAlign: 'center' },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 12,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: extra.cardBorder,
    backgroundColor: color.surface,
  },
  thumb: {
    width: 64,
    height: 64,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: color.fill,
  },
  cardText: { flex: 1, gap: 3 },
  bar: { padding: 12, gap: 6 },
  loading: {
    flex: 1,
    alignItems: 'center',
    gap: 26,
    paddingTop: 130,
    paddingHorizontal: 24,
    backgroundColor: color.surface,
  },
});

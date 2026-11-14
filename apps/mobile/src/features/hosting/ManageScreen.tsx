import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/Button';
import { CheckIcon } from '../../components/icons';
import { ScreenHeader } from '../../components/ScreenHeader';
import { BottomSheet, EmptyState, Skeleton } from '../../components/parts';
import { color, extra, radius, type } from '../../components/theme';
import { useScreenInsets } from '../../components/useScreenInsets';
import { errorCode } from '../../lib/backend/backend';
import type { Guest, GuestState } from '../../lib/backend/types';
import { timeRange, longDate } from '../../lib/dates';
import { useNow } from '../../lib/useNow';
import { newIdempotencyKey, usePlan } from '../plans/queries';
import { useCheckInGuest, useEndPlan, useGuests, useHostSummary } from './queries';
import { BringSection } from './BringSection';
import { canEnd, checkinOpen } from './rules';

const STATE_LABEL: Record<
  GuestState,
  'stateGoing' | 'stateCheckedIn' | 'stateNoShow' | 'stateWaitlisted' | 'stateOffered'
> = {
  going: 'stateGoing',
  checked_in: 'stateCheckedIn',
  no_show: 'stateNoShow',
  waitlisted: 'stateWaitlisted',
  offered: 'stateOffered',
};

/** The host's view of a Plan: who is coming, check-in while the window is open, and ending it. */
export default function ManageScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const insets = useScreenInsets();
  const router = useRouter();
  const plan = usePlan(id);
  const guests = useGuests(id);
  const summary = useHostSummary(id);
  const checkIn = useCheckInGuest(id);
  const end = useEndPlan(id);
  const [confirmEnd, setConfirmEnd] = useState(false);
  // One key for this visit's End Plan, so a retry after a lost response replays the same ending.
  const [endKey] = useState(newIdempotencyKey);
  // Per guest and per change, so a retry of the same tap reuses its key.
  const checkKeys = useRef(new Map<string, string>());
  const now = useNow();

  const back = (
    <ScreenHeader
      backLabel={t('common.back')}
      onBack={() => {
        if (router.canGoBack()) router.back();
        else router.replace('/my-plans');
      }}
    />
  );

  if (plan.isPending || summary.isPending) {
    return (
      <View
        role="status"
        accessibilityLabel={t('common.loading')}
        aria-busy
        style={styles.screen}
      >
        <Skeleton width="70%" height={34} radius={8} />
        <Skeleton width="100%" height={120} radius={radius.card} />
      </View>
    );
  }
  if (plan.isError || summary.isError) {
    const missing = errorCode(plan.error ?? summary.error) === 'forbidden';
    return (
      <View style={styles.screen}>
        {back}
        <EmptyState
          title={missing ? t('errors.notFoundTitle') : t('errors.serverTitle')}
          text={missing ? t('errors.notFoundText') : t('errors.serverText')}
          actions={
            <Button
              label={t('common.retry')}
              onPress={() => {
                void plan.refetch();
                void summary.refetch();
              }}
            />
          }
        />
      </View>
    );
  }

  const detail = plan.data.plan;
  const window = { startsAt: detail.startsAt, endsAt: detail.endsAt };
  const ended = summary.data.ended;
  // A Plan that is on hold or cancelled is not running, whatever its times say.
  const live = summary.data.live;
  const open = live && checkinOpen(window, ended, now);
  const endable = live && canEnd(detail.startsAt, ended, now);
  // Bring items change only while the Plan can still take guests: live, not ended, before its end.
  const itemsEditable = live && !ended && now.getTime() < Date.parse(detail.endsAt);
  const rows: Guest[] = guests.data ?? [];

  const toggle = (guest: Guest) => {
    const checkedIn = guest.state !== 'checked_in';
    const attempt = `${guest.userId}:${checkedIn}`;
    const key = checkKeys.current.get(attempt) ?? newIdempotencyKey();
    checkKeys.current.set(attempt, key);
    checkIn.mutate(
      { userId: guest.userId, checkedIn, key },
      {
        onSuccess: () => {
          checkKeys.current.delete(attempt);
        },
      },
    );
  };

  return (
    <View style={styles.screen}>
      {back}
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: 16, paddingBottom: 40 + insets.bottom },
        ]}
      >
        {open ? (
          <Text
            maxFontSizeMultiplier={2.0}
            style={type(13, 'semibold', { color: color.brand, tracking: 0.6 })}
          >
            {t('host.happeningNow')}
          </Text>
        ) : null}
        <Text
          maxFontSizeMultiplier={1.4}
          accessibilityRole="header"
          style={type(32, 'bold', { tracking: -1, leading: 1.06 })}
        >
          {open
            ? t('host.hereCount', {
                here: summary.data.checkedIn,
                total: summary.data.going + summary.data.checkedIn,
              })
            : t('host.title')}
        </Text>
        <Text
          maxFontSizeMultiplier={2.0}
          style={type(15, 'regular', { color: color.secondary })}
        >
          {open
            ? t('host.tapToCheckIn')
            : `${detail.title} · ${longDate(detail.startsAt, detail.timezone)} · ${timeRange(detail.startsAt, detail.endsAt, detail.timezone)}`}
        </Text>

        <View style={styles.summary}>
          <Stat label={t('host.summaryGoing')} value={summary.data.going} />
          <Stat label={t('host.summaryCheckedIn')} value={summary.data.checkedIn} />
          <Stat label={t('host.summaryNoShow')} value={summary.data.noShow} />
        </View>
        <Text
          maxFontSizeMultiplier={2.0}
          style={type(15, 'regular', { color: color.secondary })}
        >
          {summary.data.averageRating !== null
            ? t('host.ratingLine', {
                average: summary.data.averageRating.toFixed(1),
                count: summary.data.feedbackCount,
              })
            : summary.data.feedbackCount > 0
              ? t('host.ratingHidden')
              : t('host.ratingNone')}
        </Text>

        <Text
          maxFontSizeMultiplier={1.6}
          accessibilityRole="header"
          style={type(20, 'semibold', { tracking: -0.4 })}
        >
          {t('host.guestsTitle')}
        </Text>
        {!live ? (
          <Text
            maxFontSizeMultiplier={2.0}
            style={type(15, 'regular', { color: color.secondary })}
          >
            {t('host.notLive')}
          </Text>
        ) : !open && !ended ? (
          <Text
            maxFontSizeMultiplier={2.0}
            style={type(15, 'regular', { color: color.secondary })}
          >
            {now.getTime() < Date.parse(detail.startsAt) - 2 * 3_600_000
              ? t('host.windowOpens')
              : t('host.windowClosed')}
          </Text>
        ) : null}
        {guests.isPending ? (
          <Skeleton width="100%" height={88} radius={radius.card} />
        ) : guests.isError ? (
          <Text
            maxFontSizeMultiplier={2.0}
            role="alert"
            style={type(15, 'regular', { color: color.danger })}
          >
            {t('errors.serverText')}
          </Text>
        ) : rows.length === 0 ? (
          <Text
            maxFontSizeMultiplier={2.0}
            style={type(15, 'regular', { color: color.secondary })}
          >
            {t('host.guestsEmpty')}
          </Text>
        ) : (
          rows.map((guest, index) => {
            const canCheck = open && (guest.state === 'going' || guest.state === 'checked_in');
            const checked = guest.state === 'checked_in';
            const busy = checkIn.isPending && checkIn.variables.userId === guest.userId;
            const tint = extra.tints[index % extra.tints.length] ?? extra.tints[0];
            const name = checked
              ? t('host.undoCheckInFor', { name: guest.displayName })
              : t('host.checkInFor', { name: guest.displayName });
            return (
              <Pressable
                key={guest.userId}
                accessibilityRole={canCheck ? 'checkbox' : 'text'}
                accessibilityLabel={
                  canCheck
                    ? name
                    : `${guest.displayName}, ${t(`host.${STATE_LABEL[guest.state]}`)}`
                }
                aria-checked={canCheck ? checked : undefined}
                disabled={!canCheck || busy}
                onPress={() => {
                  toggle(guest);
                }}
                style={styles.guestRow}
              >
                <View
                  aria-hidden
                  style={[styles.guestAvatar, { backgroundColor: tint.background }]}
                >
                  <Text allowFontScaling={false} style={type(16, 'bold', { color: tint.text })}>
                    {guest.displayName.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.guestText}>
                  <Text maxFontSizeMultiplier={2.0} style={type(17, 'semibold')}>
                    {guest.displayName}
                  </Text>
                  <Text
                    maxFontSizeMultiplier={2.0}
                    style={type(14, 'regular', { color: color.secondary })}
                  >
                    {t(`host.${STATE_LABEL[guest.state]}`)}
                  </Text>
                </View>
                {canCheck ? (
                  <View aria-hidden style={[styles.ring, checked && styles.ringChecked]}>
                    {checked ? <CheckIcon size={15} strokeWidth={3} color="#FFFFFF" /> : null}
                  </View>
                ) : null}
              </Pressable>
            );
          })
        )}
        {checkIn.isError ? (
          <Text
            maxFontSizeMultiplier={2.0}
            role="alert"
            style={type(15, 'regular', { color: color.danger })}
          >
            {t('host.error')}
          </Text>
        ) : null}

        <Button
          variant="outline"
          label={t('chat.openPlan')}
          onPress={() => {
            router.push({ pathname: '/chat/plan/[id]', params: { id } });
          }}
        />

        <BringSection planId={id} items={plan.data.bringItems} editable={itemsEditable} />

        <View style={styles.end}>
          {ended ? (
            <Text
              maxFontSizeMultiplier={2.0}
              role="status"
              style={type(17, 'semibold', { color: color.secondary })}
            >
              {t('host.ended')}
            </Text>
          ) : endable ? (
            <Button
              variant="outline"
              label={t('host.endButton')}
              onPress={() => {
                setConfirmEnd(true);
              }}
            />
          ) : (
            <Text
              maxFontSizeMultiplier={2.0}
              style={type(15, 'regular', { color: color.secondary })}
            >
              {t('host.endTooEarly')}
            </Text>
          )}
          {end.isError ? (
            <Text
              maxFontSizeMultiplier={2.0}
              role="alert"
              style={type(15, 'regular', { color: color.danger })}
            >
              {t('host.error')}
            </Text>
          ) : null}
        </View>
      </ScrollView>

      <BottomSheet
        open={confirmEnd}
        onClose={() => {
          setConfirmEnd(false);
        }}
        title={t('host.endTitle')}
        lead={t('host.endLead')}
      >
        <Button
          label={t('host.endConfirm')}
          loading={end.isPending}
          onPress={() => {
            end.mutate(
              { key: endKey },
              {
                onSuccess: () => {
                  setConfirmEnd(false);
                },
              },
            );
          }}
        />
      </BottomSheet>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.stat}>
      <Text maxFontSizeMultiplier={1.6} style={type(22, 'bold', { tracking: -0.5 })}>
        {value}
      </Text>
      <Text maxFontSizeMultiplier={2.0} style={type(13, 'regular', { color: color.secondary })}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface },
  back: { position: 'absolute', left: 16, zIndex: 1 },
  content: { paddingHorizontal: 24, gap: 12 },
  summary: { flexDirection: 'row', gap: 10 },
  stat: {
    flex: 1,
    gap: 2,
    padding: 14,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: extra.cardBorder,
  },
  guest: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: extra.cardBorder,
  },
  guestText: { flex: 1, gap: 1 },
  guestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 64,
    borderBottomWidth: 1,
    borderBottomColor: color.fill,
  },
  guestAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: extra.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringChecked: { backgroundColor: color.brand, borderColor: color.brand },
  end: { gap: 12, paddingTop: 16 },
});

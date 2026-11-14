import { LinearGradient } from 'expo-linear-gradient';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Button, IconButton } from '../../components/Button';
import {
  CheckIcon,
  ChevronLeftIcon,
  MapTile,
  OfflineIcon,
  VerifiedIcon,
} from '../../components/icons';
import {
  BottomSheet,
  DateTile,
  EmptyState,
  FloatingActionBar,
  Skeleton,
  Toast,
} from '../../components/parts';
import { color, extra, radius, type } from '../../components/theme';
import { Photo } from '../../components/Photo';
import { useScreenInsets } from '../../components/useScreenInsets';
import { ReportLink } from '../safety/ReportLink';
import { errorCode } from '../../lib/backend/backend';
import type { PlanDetail } from '../../lib/backend/types';
import { localTime, longDate, timeRange, weekdayLong } from '../../lib/dates';
import { currentLanguage } from '../../lib/i18n';
import { ProviderButtons } from '../auth/ProviderButtons';
import { useSettings } from '../account/queries';
import { hasPushToken } from '../notifications/push';
import { OfflineBanner } from '../../components/OfflineBanner';
import { isOffline } from '../../lib/offlineCache';
import { useAuth } from '../auth/useAuth';
import {
  addressNote,
  placeLabel,
  allergenNote,
  bringItemNote,
  categoryLabel,
  goingLabel,
  isFull,
  placeInLine,
  priceLabel,
  rsvpErrorCopy,
  spotsLabel,
  spotsLeftShort,
} from './planCopy';
import { imageFocus, planImage } from './planImage';
import { newIdempotencyKey, usePlan, useRsvpMutations } from './queries';
import { useFeedback } from '../hosting/queries';

type SheetKind = 'signUp' | 'cancel' | 'leave' | null;

function Fact({
  lead,
  title,
  note,
  children,
}: {
  lead: React.ReactNode;
  title: React.ReactNode;
  note: string;
  children?: React.ReactNode;
}) {
  return (
    <View style={styles.fact}>
      {lead}
      <View style={styles.factText}>
        <Text maxFontSizeMultiplier={2.0} style={type(17, 'semibold', { tracking: -0.3 })}>
          {title}
        </Text>
        <Text
          maxFontSizeMultiplier={2.0}
          style={type(15, 'regular', { color: color.secondary, leading: 1.45 })}
        >
          {note}
        </Text>
        {children}
      </View>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text
        maxFontSizeMultiplier={1.6}
        accessibilityRole="header"
        aria-level={2}
        style={type(20, 'bold', { tracking: -0.5 })}
      >
        {title}
      </Text>
      {children}
    </View>
  );
}

function PlanView({
  detail,
  offline = false,
  savedAt = null,
  onRetry,
}: {
  detail: PlanDetail;
  offline?: boolean;
  savedAt?: number | null;
  onRetry?: () => void;
}) {
  const { plan, rsvp, bringItems, address, meetingUrl } = detail;
  const isGoing = rsvp === 'going';
  // With large type the price and the buttons no longer fit side by side: the bar stacks.
  const { fontScale } = useWindowDimensions();
  const stacked = fontScale >= 1.3;
  const [friendState, setFriendState] = useState<'idle' | 'copied' | 'failed'>('idle');
  // A guest brings a friend by the Plan's link: the web RSVP needs no app (design note §4).
  const bringFriend = async (planTitle: string, planId: string) => {
    setFriendState('idle');
    const link = `https://plantcircle.app/p/${planId}`;
    const message = t('plan.bringFriendMessage', { plan: planTitle, link });
    try {
      if (Platform.OS === 'web') {
        await navigator.clipboard.writeText(message);
        setFriendState('copied');
      } else {
        await Share.share({ message });
      }
    } catch {
      setFriendState('failed');
    }
  };
  const router = useRouter();
  const feedback = useFeedback(plan.id);
  const insets = useScreenInsets();
  const { session } = useAuth();
  const { t } = useTranslation();
  const { join, cancel, claim, unclaim, joinWaitlist } = useRsvpMutations(plan.id);
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const params = useLocalSearchParams<{ join?: string }>();
  const wantsJoin = params.join === '1';
  // No spot can be taken directly, so the way in is the waitlist.
  const full = isFull(plan);
  const taken = Math.min(plan.goingCount, plan.capacity);

  // Returning from sign-up with ?join=1: finish the join the person asked for.
  useEffect(() => {
    if (!wantsJoin || !session) return;
    router.setParams({ join: undefined });
    if (rsvp === 'none') enter();
    // `enter` and `router` are new every render; the action itself is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantsJoin, session, rsvp]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => {
      setNotice(null);
    }, 3000);
    return () => {
      clearTimeout(timer);
    };
  }, [notice]);

  /** Takes a spot, or a place in line when there is no spot to take. */
  const settings = useSettings();
  // Notifications are asked for after the first RSVP, never at sign-up: once this device is
  // registered the question is over; "Not now" asks again after 14 days.
  const afterRsvp = () => {
    const dismissed = settings.data?.notifPromptDismissedAt;
    const askAgain = !dismissed || Date.now() - Date.parse(dismissed) > 14 * 86_400_000;
    if (!settings.data || !askAgain) return;
    void hasPushToken().then((registered) => {
      if (!registered) router.push('/notifications-prompt');
    });
  };
  const enter = (key = newIdempotencyKey()) => {
    (full ? joinWaitlist : join).mutate(key, { onSuccess: afterRsvp });
  };
  const startJoin = () => {
    if (!session) setSheet('signUp');
    else enter();
  };
  const afterSignUp = () => {
    setSheet(null);
    enter();
  };

  const entering = full ? joinWaitlist : join;
  const failed = join.isError
    ? join
    : joinWaitlist.isError
      ? joinWaitlist
      : cancel.isError
        ? cancel
        : claim.isError
          ? claim
          : unclaim.isError
            ? unclaim
            : null;
  const failure = failed ? errorCode(failed.error) : null;
  const failureCopy =
    failed === claim && failure === 'item_taken'
      ? { title: t('plan.error.itemTakenTitle'), detail: t('plan.error.itemTakenDetail') }
      : (failed === join || failed === joinWaitlist) && failure
        ? rsvpErrorCopy(t, failure)
        : failed
          ? { title: t('plan.error.genericTitle'), detail: t('plan.error.genericDetail') }
          : null;
  // A retry re-sends the same idempotency key, so it can never apply twice.
  const retry = () => {
    if (failed === join && join.variables)
      join.mutate(join.variables, { onSuccess: afterRsvp });
    else if (failed === joinWaitlist && joinWaitlist.variables) {
      joinWaitlist.mutate(joinWaitlist.variables, { onSuccess: afterRsvp });
    } else if (failed === cancel && cancel.variables) cancel.mutate(cancel.variables);
    else if (failed === claim) claim.mutate(claim.variables);
    else if (failed === unclaim) unclaim.mutate(unclaim.variables);
  };

  const busy = join.isPending || joinWaitlist.isPending || cancel.isPending || offline;
  const barTitle =
    rsvp === 'offered'
      ? t('plan.offerBarTitle')
      : full && !isGoing
        ? t('plan.full')
        : priceLabel(t, plan, currentLanguage());
  const barNote = entering.isError
    ? failure === 'network'
      ? t('plan.checkConnection')
      : t('plan.notSaved')
    : isGoing
      ? t('plan.seeYou', { day: weekdayLong(plan.startsAt, plan.timezone) })
      : rsvp === 'offered' && detail.offerExpiresAt
        ? t('plan.confirmBy', { time: localTime(detail.offerExpiresAt) })
        : rsvp === 'waitlisted' && detail.waitlistPosition
          ? t('plan.youAre', { place: placeInLine(t, detail.waitlistPosition) })
          : full
            ? t('plan.wouldBe', { place: placeInLine(t, plan.waitlistCount + 1) })
            : spotsLeftShort(t, plan);
  const hostFirstName = plan.hostName.split(' ')[0] ?? plan.hostName;

  return (
    <View style={styles.screen}>
      {/* Focusable on web so the page can be scrolled with the keyboard. */}
      <ScrollView
        contentContainerStyle={{ paddingBottom: 170 + insets.bottom }}
        {...(Platform.OS === 'web' ? { tabIndex: 0 as const } : {})}
      >
        <View style={styles.hero}>
          <Photo
            source={planImage(plan)}
            contentPosition={imageFocus(plan)}
            alt={plan.imageAlt}
          />
          <LinearGradient
            colors={[
              'rgba(0,0,0,0.35)',
              'rgba(0,0,0,0)',
              'rgba(0,0,0,0)',
              'rgba(0,0,0,0.9)',
              'rgba(0,0,0,0.94)',
            ]}
            locations={[0, 0.18, 0.3, 0.6, 1]}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.heroText}>
            <Text
              maxFontSizeMultiplier={2.0}
              style={[type(13, 'semibold', { color: '#FFFFFF', tracking: 0.6 }), styles.upper]}
            >
              {categoryLabel(t, plan)}
              {full ? ` · ${t('plan.full')}` : ''}
            </Text>
            <Text
              maxFontSizeMultiplier={1.4}
              accessibilityRole="header"
              style={type(34, 'bold', { color: '#FFFFFF', tracking: -1.2, leading: 1.02 })}
            >
              {plan.title}
            </Text>
            <Text maxFontSizeMultiplier={2.0} style={type(16, 'regular', { color: '#FFFFFF' })}>
              {plan.venueName ?? plan.areaName}
            </Text>
          </View>
        </View>

        <View style={styles.body}>
          <View style={styles.facts}>
            <Fact
              lead={<DateTile iso={plan.startsAt} timeZone={plan.timezone} />}
              title={longDate(plan.startsAt, plan.timezone)}
              note={timeRange(plan.startsAt, plan.endsAt, plan.timezone)}
            />
            <Fact
              lead={<MapTile />}
              title={placeLabel(t, plan)}
              note={addressNote(t, plan, isGoing, address, meetingUrl)}
            />
            {meetingUrl ? (
              <Button
                label={t('plan.joinMeet')}
                onPress={() => {
                  void Linking.openURL(meetingUrl);
                }}
              />
            ) : null}
            <Fact
              lead={
                <View aria-hidden style={styles.cluster}>
                  {plan.attendeeInitials.slice(0, 3).map((initial, index) => (
                    <View
                      key={index}
                      style={[
                        styles.clusterFace,
                        CLUSTER_POSITIONS[index],
                        { backgroundColor: extra.tints[index]?.background },
                      ]}
                    >
                      <Text
                        allowFontScaling={false}
                        style={type(12, 'bold', {
                          color: extra.tints[index]?.text ?? color.ink,
                        })}
                      >
                        {initial}
                      </Text>
                    </View>
                  ))}
                </View>
              }
              title={goingLabel(t, plan, isGoing)}
              note={
                plan.waitlistCount > 0
                  ? t('plan.onWaitlist', { count: plan.waitlistCount })
                  : spotsLabel(t, plan)
              }
            >
              <View
                role="img"
                accessibilityLabel={t('plan.spotsTaken', { taken, capacity: plan.capacity })}
                style={styles.meter}
              >
                <View
                  style={[styles.meterFill, { width: `${(taken / plan.capacity) * 100}%` }]}
                />
              </View>
            </Fact>
            <Fact
              lead={
                <View
                  aria-hidden
                  style={[styles.hostAvatar, { backgroundColor: extra.tints[2].background }]}
                >
                  <Text
                    allowFontScaling={false}
                    style={type(21, 'bold', { color: extra.tints[2].text })}
                  >
                    {plan.hostName.charAt(0).toUpperCase()}
                  </Text>
                </View>
              }
              title={
                <>
                  {plan.hostName}
                  {plan.hostVerified ? (
                    <>
                      {' '}
                      <VerifiedIcon />
                    </>
                  ) : null}
                </>
              }
              note={`${plan.hostVerified ? t('plan.verifiedHost') : t('plan.yourHost')} · ${t('plan.plansHosted', { count: plan.hostPlansCount })}`}
            />
          </View>

          {full && !isGoing ? (
            <Section title={t('plan.waitlistTitle')}>
              <Text
                maxFontSizeMultiplier={2.0}
                style={type(17, 'regular', { color: extra.bodyText, leading: 1.55 })}
              >
                {t('plan.waitlistText')}
              </Text>
            </Section>
          ) : null}

          <Section title={t('plan.about')}>
            <Text
              maxFontSizeMultiplier={2.0}
              style={type(17, 'regular', { color: extra.bodyText, leading: 1.55 })}
            >
              {plan.description}
            </Text>
          </Section>

          {isGoing ? (
            <Button
              variant="outline"
              label={t('chat.openPlan')}
              onPress={() => {
                router.push({ pathname: '/chat/plan/[id]', params: { id: plan.id } });
              }}
            />
          ) : null}

          {bringItems.length > 0 ? (
            <Section title={t('plan.bring')}>
              <View>
                {bringItems.map((item) => {
                  const open = item.claimedCount < item.quantity && !item.claimedByMe;
                  const note = bringItemNote(t, item);
                  return (
                    <View key={item.id} style={styles.bringItem}>
                      <View style={styles.bringText}>
                        <Text maxFontSizeMultiplier={2.0} style={type(17, 'medium')}>
                          {item.label}
                        </Text>
                        <Text
                          maxFontSizeMultiplier={2.0}
                          style={type(14, 'regular', { color: color.secondary })}
                        >
                          {note}
                        </Text>
                      </View>
                      {item.claimedByMe ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={t('plan.withdrawBringItem', { item: item.label })}
                          aria-disabled={unclaim.isPending}
                          disabled={unclaim.isPending}
                          onPress={() => {
                            unclaim.mutate({ itemId: item.id, key: newIdempotencyKey() });
                          }}
                          style={styles.bringButton}
                        >
                          <Text
                            maxFontSizeMultiplier={2.0}
                            style={type(15, 'semibold', { color: '#FFFFFF' })}
                          >
                            {t('plan.withdrawBring')}
                          </Text>
                        </Pressable>
                      ) : open ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={t('plan.illBringItem', { item: item.label })}
                          aria-disabled={claim.isPending || busy}
                          disabled={claim.isPending || busy}
                          onPress={() => {
                            if (isGoing)
                              claim.mutate({ itemId: item.id, key: newIdempotencyKey() });
                            else if (session) setNotice(t('plan.joinFirst'));
                            else setSheet('signUp');
                          }}
                          style={styles.bringButton}
                        >
                          <Text
                            maxFontSizeMultiplier={2.0}
                            style={type(15, 'semibold', { color: '#FFFFFF' })}
                          >
                            {t('plan.illBring')}
                          </Text>
                        </Pressable>
                      ) : (
                        <CheckIcon size={22} strokeWidth={2.6} color={color.brand} />
                      )}
                    </View>
                  );
                })}
              </View>
            </Section>
          ) : null}

          <Section title={t('plan.goodToKnow')}>
            <View style={styles.notes}>
              {isGoing ? (
                <Text
                  maxFontSizeMultiplier={2.0}
                  style={type(15, 'regular', { color: extra.bodyText, leading: 1.5 })}
                >
                  <Text maxFontSizeMultiplier={2.0} style={styles.strong}>
                    {t('offline.savedOnPhone')}
                  </Text>{' '}
                  {t('offline.savedOnPhoneNote')}
                </Text>
              ) : null}
              <Text
                maxFontSizeMultiplier={2.0}
                style={type(15, 'regular', { color: extra.bodyText, leading: 1.5 })}
              >
                <Text maxFontSizeMultiplier={2.0} style={styles.strong}>
                  {t('plan.allergens')}
                </Text>{' '}
                {allergenNote(t, plan)}
              </Text>
              <Text
                maxFontSizeMultiplier={2.0}
                style={type(15, 'regular', { color: extra.bodyText, leading: 1.5 })}
              >
                <Text maxFontSizeMultiplier={2.0} style={styles.strong}>
                  {t('plan.cantMakeIt')}
                </Text>{' '}
                {t('plan.cancelAnytime')}
              </Text>
            </View>
          </Section>
          <ReportLink targetType="plan" targetId={plan.id} name={plan.title} />
        </View>
      </ScrollView>

      <IconButton
        variant="glass"
        label={t('common.back')}
        onPress={() => {
          if (router.canGoBack()) router.back();
          else router.replace('/home');
        }}
        style={[styles.back, { top: insets.headerTop }]}
      >
        <ChevronLeftIcon strokeWidth={2.2} color="#FFFFFF" />
      </IconButton>

      {offline ? (
        <View style={[styles.offlineBar, { top: insets.headerTop + 56 }]}>
          <OfflineBanner savedAt={savedAt} />
        </View>
      ) : null}
      {failureCopy ? (
        <Toast
          tone="alert"
          title={failureCopy.title}
          detail={failureCopy.detail}
          icon={<OfflineIcon size={20} color="#FFFFFF" />}
          {...(failure === 'network' || failure === 'unknown'
            ? { action: { label: 'Retry', onPress: retry } }
            : {})}
        />
      ) : notice ? (
        <Toast tone="status" title={notice} />
      ) : feedback.data?.eligible ? (
        <Toast
          tone="status"
          title={t('hostFeedback.title')}
          action={{
            label: t('hostFeedback.leave'),
            onPress: () => {
              router.push({ pathname: '/plan/[id]/feedback', params: { id: plan.id } });
            },
          }}
        />
      ) : null}

      {offline ? (
        <FloatingActionBar style={[styles.bar, stacked && styles.barStacked]}>
          <View style={styles.barText}>
            <Text maxFontSizeMultiplier={1.6} style={type(18, 'bold', { tracking: -0.3 })}>
              {t('offline.cantChange')}
            </Text>
            <Text
              maxFontSizeMultiplier={2.0}
              style={type(14, 'regular', { color: color.secondary })}
            >
              {t('offline.reconnect')}
            </Text>
          </View>
          <Button
            variant="outline"
            label={t('common.retry')}
            onPress={() => {
              onRetry?.();
            }}
          />
        </FloatingActionBar>
      ) : null}
      {offline ? null : (
        <FloatingActionBar style={[styles.bar, stacked && styles.barStacked]}>
          <View style={styles.barText}>
            <Text maxFontSizeMultiplier={1.6} style={type(18, 'bold', { tracking: -0.3 })}>
              {barTitle}
            </Text>
            <Text
              maxFontSizeMultiplier={2.0}
              accessibilityLiveRegion="polite"
              style={type(14, 'regular', { color: color.secondary })}
            >
              {barNote}
            </Text>
          </View>
          {isGoing ? (
            <View style={styles.goingActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('plan.youreGoing')}
                accessibilityHint={t('plan.cancelHint')}
                onPress={() => {
                  setSheet('cancel');
                }}
                style={[styles.cta, styles.ctaGoing]}
              >
                <Text
                  maxFontSizeMultiplier={2.0}
                  style={type(17, 'semibold', { color: color.brand, tracking: -0.2 })}
                >
                  {cancel.isPending ? t('plan.cancelling') : t('plan.youreGoing')}
                </Text>
              </Pressable>
              <Button
                variant="outline"
                label={t('plan.bringFriend')}
                onPress={() => void bringFriend(plan.title, plan.id)}
              />
              {friendState !== 'idle' ? (
                <Text
                  maxFontSizeMultiplier={2.0}
                  role="status"
                  style={type(14, 'regular', {
                    color: friendState === 'copied' ? color.secondary : color.danger,
                  })}
                >
                  {friendState === 'copied'
                    ? t('plan.bringFriendCopied')
                    : t('plan.bringFriendFailed')}
                </Text>
              ) : null}
              {friendState === 'failed' ? (
                <Text
                  maxFontSizeMultiplier={2.0}
                  selectable
                  style={type(15, 'medium', { color: color.brand })}
                >
                  {`https://plantcircle.app/p/${plan.id}`}
                </Text>
              ) : null}
            </View>
          ) : rsvp === 'waitlisted' ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('plan.onWaitlistCta')}
              accessibilityHint={t('plan.leaveHint')}
              onPress={() => {
                setSheet('leave');
              }}
              style={[styles.cta, styles.ctaGoing]}
            >
              <Text
                maxFontSizeMultiplier={2.0}
                style={type(17, 'semibold', { color: color.brand, tracking: -0.2 })}
              >
                {t('plan.onWaitlistCta')}
              </Text>
            </Pressable>
          ) : rsvp === 'offered' ? (
            <Button
              label={t('plan.confirmSpot')}
              onPress={() => {
                router.push({ pathname: '/plan/[id]/waitlist-offer', params: { id: plan.id } });
              }}
              style={styles.cta}
            />
          ) : (
            <Button
              label={
                entering.isError
                  ? t('common.tryAgain')
                  : full
                    ? t('plan.joinWaitlist')
                    : t('plan.join')
              }
              loading={entering.isPending}
              onPress={() => {
                // Retrying re-sends the same idempotency key.
                if (entering.isError && entering.variables) entering.mutate(entering.variables);
                else startJoin();
              }}
              style={styles.cta}
            />
          )}
        </FloatingActionBar>
      )}

      <BottomSheet
        open={sheet === 'signUp'}
        onClose={() => {
          setSheet(null);
        }}
        title={t('plan.sheet.saveSpot')}
        lead={t('plan.sheet.saveSpotLead', { host: hostFirstName })}
      >
        <ProviderButtons gap={14} onSignedIn={afterSignUp} />
        <Pressable
          accessibilityRole="link"
          onPress={() => {
            setSheet(null);
            router.push({ pathname: '/sign-up', params: { next: `/plan/${plan.id}?join=1` } });
          }}
          style={styles.sheetLink}
        >
          <Text maxFontSizeMultiplier={2.0} style={[type(15, 'semibold'), styles.underline]}>
            {t('plan.sheet.useEmail')}
          </Text>
        </Pressable>
        <Text
          maxFontSizeMultiplier={2.0}
          style={[type(13, 'regular', { color: color.secondary, leading: 1.5 }), styles.center]}
        >
          {t('plan.sheet.legal')}
        </Text>
      </BottomSheet>

      <BottomSheet
        open={sheet === 'cancel'}
        onClose={() => {
          setSheet(null);
        }}
        title={t('plan.sheet.cancelTitle')}
        lead={t('plan.sheet.cancelLead')}
      >
        <Button
          label={t('plan.sheet.cancelConfirm')}
          onPress={() => {
            setSheet(null);
            cancel.mutate(newIdempotencyKey());
          }}
        />
        <Button
          variant="ghost"
          label={t('plan.sheet.keep')}
          onPress={() => {
            setSheet(null);
          }}
        />
      </BottomSheet>

      <BottomSheet
        open={sheet === 'leave'}
        onClose={() => {
          setSheet(null);
        }}
        title={t('plan.sheet.leaveTitle')}
        lead={t('plan.sheet.leaveLead')}
      >
        <Button
          label={t('plan.sheet.leaveConfirm')}
          onPress={() => {
            setSheet(null);
            cancel.mutate(newIdempotencyKey());
          }}
        />
        <Button
          variant="ghost"
          label={t('plan.sheet.stay')}
          onPress={() => {
            setSheet(null);
          }}
        />
      </BottomSheet>
    </View>
  );
}

export default function PlanScreen() {
  const { t } = useTranslation();
  const { id: planId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const plan = usePlan(planId);
  const goHome = () => {
    router.replace('/home');
  };

  if (plan.isPending) {
    return (
      <View
        role="status"
        accessibilityLabel={t('common.loading')}
        aria-busy
        style={styles.screen}
      >
        <Skeleton width="100%" height={420} radius={0} />
        <View style={styles.loading}>
          {[0, 1, 2, 3].map((row) => (
            <Skeleton key={row} width="100%" height={56} radius={16} />
          ))}
        </View>
      </View>
    );
  }

  if (plan.data?.plan.category === 'group_order') {
    return <Redirect href={{ pathname: '/order/[id]', params: { id: planId } }} />;
  }
  // Offline with a saved copy: the Plan stays readable; changes wait for the connection.
  if (isOffline(plan) && plan.data) {
    return (
      <PlanView
        detail={plan.data}
        offline
        savedAt={plan.dataUpdatedAt}
        onRetry={() => void plan.refetch()}
      />
    );
  }
  if (plan.isError) {
    const code = errorCode(plan.error);
    const missing = code === 'not_found';
    return (
      <EmptyState
        {...(missing
          ? {}
          : {
              onSavedPlans: () => {
                router.push('/my-plans');
              },
            })}
        title={
          missing
            ? t('plan.unavailableTitle')
            : code === 'network'
              ? t('errors.offlineTitle')
              : t('errors.serverTitle')
        }
        text={
          missing
            ? t('plan.unavailableText')
            : code === 'network'
              ? t('errors.offlineText')
              : t('errors.serverText')
        }
        actions={
          <>
            {missing ? null : (
              <Button label={t('common.tryAgain')} onPress={() => void plan.refetch()} />
            )}
            <Button
              variant={missing ? 'primary' : 'ghost'}
              label={t('common.backToHome')}
              onPress={goHome}
            />
          </>
        }
      />
    );
  }

  return <PlanView detail={plan.data} />;
}

const CLUSTER_POSITIONS = [
  { top: 4, left: 0 },
  { top: 4, left: 20 },
  { top: 26, left: 10 },
] as const;

const styles = StyleSheet.create({
  offlineBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    borderRadius: 12,
    overflow: 'hidden',
    zIndex: 2,
  },
  screen: { flex: 1, backgroundColor: color.surface },
  hero: { height: 420, backgroundColor: color.ink },
  heroText: { position: 'absolute', left: 24, right: 24, bottom: 30, gap: 10 },
  upper: { textTransform: 'uppercase' },
  back: { position: 'absolute', left: 16 },
  body: { paddingTop: 28, paddingHorizontal: 24 },
  facts: { gap: 20, marginBottom: 32 },
  fact: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  factText: { flex: 1, gap: 3 },
  cluster: { width: 56, height: 56 },
  clusterFace: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  meter: {
    height: 4,
    marginTop: 6,
    borderRadius: radius.pill,
    backgroundColor: color.line,
    overflow: 'hidden',
  },
  meterFill: { height: '100%', backgroundColor: color.brand },
  hostAvatar: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: {
    gap: 14,
    marginBottom: 28,
    paddingTop: 28,
    borderTopWidth: 1,
    borderTopColor: color.line,
  },
  bringItem: {
    minHeight: 52,
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: color.line,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  bringText: { flex: 1, gap: 2 },
  bringButton: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    backgroundColor: color.ink,
    justifyContent: 'center',
  },
  notes: { gap: 10 },
  strong: { fontWeight: '700', color: color.ink },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
    paddingVertical: 10,
    paddingLeft: 20,
    paddingRight: 10,
  },
  barStacked: { flexDirection: 'column', alignItems: 'stretch', paddingRight: 20 },
  barText: { flex: 1, gap: 1 },
  goingActions: { gap: 10 },
  cta: {
    minWidth: 150,
    minHeight: 52,
    paddingHorizontal: 24,
    borderRadius: radius.button,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaGoing: { backgroundColor: color.brandTint },
  sheetLink: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  underline: { textDecorationLine: 'underline' },
  center: { textAlign: 'center' },
  loading: { padding: 24, gap: 20 },
});

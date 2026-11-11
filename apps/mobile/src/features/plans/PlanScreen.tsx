import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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
import { errorCode } from '../../lib/backend/backend';
import type { PlanDetail } from '../../lib/backend/types';
import { longDate, timeRange, weekdayLong } from '../../lib/dates';
import { ProviderButtons } from '../auth/ProviderButtons';
import { useAuth } from '../auth/useAuth';
import {
  addressNote,
  allergenNote,
  bringItemNote,
  categoryLabel,
  goingLabel,
  isFull,
  priceLabel,
  rsvpErrorCopy,
  spotsLabel,
  spotsLeftShort,
} from './planCopy';
import { imageFocus, planImage } from './planImage';
import { newIdempotencyKey, usePlan, useRsvpMutations } from './queries';

type SheetKind = 'signUp' | 'cancel' | null;

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
        <Text style={type(17, 'semibold', { tracking: -0.3 })}>{title}</Text>
        <Text style={type(15, 'regular', { color: color.secondary, leading: 1.45 })}>
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

function PlanView({ detail }: { detail: PlanDetail }) {
  const { plan, isGoing, bringItems, address } = detail;
  const router = useRouter();
  const insets = useScreenInsets();
  const { session } = useAuth();
  const { join, cancel, claim } = useRsvpMutations(plan.id);
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const params = useLocalSearchParams<{ join?: string }>();
  const wantsJoin = params.join === '1';
  const full = isFull(plan) && !isGoing;
  const taken = Math.min(plan.goingCount, plan.capacity);

  // Returning from sign-up with ?join=1: finish the join the person asked for.
  useEffect(() => {
    if (!wantsJoin || !session) return;
    router.setParams({ join: undefined });
    if (!isGoing) join.mutate(newIdempotencyKey());
    // `join` and `router` are new objects every render; the action itself is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantsJoin, session, isGoing]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => {
      setNotice(null);
    }, 3000);
    return () => {
      clearTimeout(timer);
    };
  }, [notice]);

  const startJoin = () => {
    if (!session) setSheet('signUp');
    else join.mutate(newIdempotencyKey());
  };
  const afterSignUp = () => {
    setSheet(null);
    join.mutate(newIdempotencyKey());
  };

  const failed = join.isError ? join : cancel.isError ? cancel : claim.isError ? claim : null;
  const failure = failed ? errorCode(failed.error) : null;
  const failureCopy =
    failed === claim && failure === 'item_taken'
      ? { title: 'Someone is already bringing this', detail: 'Pick something else' }
      : failed === join && failure
        ? rsvpErrorCopy(failure)
        : failed
          ? { title: 'Couldn’t save that', detail: 'Nothing was changed' }
          : null;
  // A retry re-sends the same idempotency key, so it can never apply twice.
  const retry = () => {
    if (failed === join && join.variables) join.mutate(join.variables);
    else if (failed === cancel && cancel.variables) cancel.mutate(cancel.variables);
    else if (failed === claim) claim.mutate(claim.variables);
  };

  const busy = join.isPending || cancel.isPending;
  const barNote = join.isError
    ? failure === 'network'
      ? 'Check your connection'
      : 'Not saved'
    : isGoing
      ? `See you ${weekdayLong(plan.startsAt, plan.timezone)}`
      : full
        ? 'No spots left'
        : spotsLeftShort(plan);
  const hostFirstName = plan.hostName.split(' ')[0] ?? 'the host';

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={{ paddingBottom: 170 + insets.bottom }}>
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
              style={[type(13, 'semibold', { color: '#FFFFFF', tracking: 0.6 }), styles.upper]}
            >
              {categoryLabel(plan.category)}
              {full ? ' · Full' : ''}
            </Text>
            <Text
              accessibilityRole="header"
              style={type(34, 'bold', { color: '#FFFFFF', tracking: -1.2, leading: 1.02 })}
            >
              {plan.title}
            </Text>
            <Text style={type(16, 'regular', { color: '#FFFFFF' })}>
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
              title={plan.areaName}
              note={addressNote(plan, isGoing, address)}
            />
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
              title={goingLabel(plan, isGoing)}
              note={spotsLabel(plan)}
            >
              <View
                role="img"
                accessibilityLabel={`${taken} of ${plan.capacity} spots taken`}
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
              note={`${plan.hostVerified ? 'Verified host' : 'Your host'} · ${plan.hostPlansCount} ${plan.hostPlansCount === 1 ? 'Plan' : 'Plans'} hosted`}
            />
          </View>

          <Section title="About">
            <Text style={type(17, 'regular', { color: extra.bodyText, leading: 1.55 })}>
              {plan.description}
            </Text>
          </Section>

          {bringItems.length > 0 ? (
            <Section title="Bring something">
              <View>
                {bringItems.map((item) => {
                  const open = item.claimedCount < item.quantity && !item.claimedByMe;
                  const note = item.claimedByMe ? 'You’re bringing this' : bringItemNote(item);
                  return (
                    <View key={item.id} style={styles.bringItem}>
                      <View style={styles.bringText}>
                        <Text style={type(17, 'medium')}>{item.label}</Text>
                        <Text style={type(14, 'regular', { color: color.secondary })}>
                          {note}
                        </Text>
                      </View>
                      {open ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`I’ll bring it: ${item.label}`}
                          aria-disabled={claim.isPending || busy}
                          disabled={claim.isPending || busy}
                          onPress={() => {
                            if (isGoing)
                              claim.mutate({ itemId: item.id, key: newIdempotencyKey() });
                            else if (session) setNotice('Join this Plan first');
                            else setSheet('signUp');
                          }}
                          style={styles.bringButton}
                        >
                          <Text style={type(15, 'semibold', { color: '#FFFFFF' })}>
                            I’ll bring it
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

          <Section title="Good to know">
            <View style={styles.notes}>
              <Text style={type(15, 'regular', { color: extra.bodyText, leading: 1.5 })}>
                <Text style={styles.strong}>Allergens:</Text> {allergenNote(plan)}
              </Text>
              <Text style={type(15, 'regular', { color: extra.bodyText, leading: 1.5 })}>
                <Text style={styles.strong}>Can’t make it?</Text> Cancel any time so someone
                else can take your spot.
              </Text>
            </View>
          </Section>
        </View>
      </ScrollView>

      <IconButton
        variant="glass"
        label="Back"
        onPress={() => {
          if (router.canGoBack()) router.back();
          else router.replace('/home');
        }}
        style={[styles.back, { top: insets.headerTop }]}
      >
        <ChevronLeftIcon strokeWidth={2.2} color="#FFFFFF" />
      </IconButton>

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
      ) : null}

      <FloatingActionBar style={styles.bar}>
        <View style={styles.barText}>
          <Text style={type(18, 'bold', { tracking: -0.3 })}>{priceLabel(plan)}</Text>
          <Text
            accessibilityLiveRegion="polite"
            style={type(14, 'regular', { color: color.secondary })}
          >
            {barNote}
          </Text>
        </View>
        {isGoing ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="You’re going"
            accessibilityHint="Opens the option to cancel your spot"
            onPress={() => {
              setSheet('cancel');
            }}
            style={[styles.cta, styles.ctaGoing]}
          >
            <Text style={type(17, 'semibold', { color: color.brand, tracking: -0.2 })}>
              {cancel.isPending ? 'Cancelling…' : 'You’re going'}
            </Text>
          </Pressable>
        ) : (
          <Button
            label={full ? 'Full' : join.isError ? 'Try again' : 'Join'}
            disabled={full}
            loading={join.isPending}
            onPress={() => {
              if (join.isError && join.variables) join.mutate(join.variables);
              else startJoin();
            }}
            style={styles.cta}
          />
        )}
      </FloatingActionBar>

      <BottomSheet
        open={sheet === 'signUp'}
        onClose={() => {
          setSheet(null);
        }}
        title="Save your spot"
        lead={`Create an account so ${hostFirstName} knows you’re coming and you get the address.`}
      >
        <ProviderButtons gap={14} onSignedIn={afterSignUp} />
        <Pressable
          accessibilityRole="link"
          onPress={() => {
            setSheet(null);
            router.push({ pathname: '/signup', params: { next: `/plans/${plan.id}?join=1` } });
          }}
          style={styles.sheetLink}
        >
          <Text style={[type(15, 'semibold'), styles.underline]}>Use email instead</Text>
        </Pressable>
        <Text
          style={[type(13, 'regular', { color: color.secondary, leading: 1.5 }), styles.center]}
        >
          You confirm you’re 18+ and accept the Terms and Community Rules.
        </Text>
      </BottomSheet>

      <BottomSheet
        open={sheet === 'cancel'}
        onClose={() => {
          setSheet(null);
        }}
        title="Cancel your spot?"
        lead="Your spot goes back to the group, and anything you said you’d bring is released."
      >
        <Button
          label="Cancel my spot"
          onPress={() => {
            setSheet(null);
            cancel.mutate(newIdempotencyKey());
          }}
        />
        <Button
          variant="ghost"
          label="Keep my spot"
          onPress={() => {
            setSheet(null);
          }}
        />
      </BottomSheet>
    </View>
  );
}

export default function PlanScreen() {
  const { planId } = useLocalSearchParams<{ planId: string }>();
  const router = useRouter();
  const plan = usePlan(planId);
  const goHome = () => {
    router.replace('/home');
  };

  if (plan.isPending) {
    return (
      <View role="status" accessibilityLabel="Loading" aria-busy style={styles.screen}>
        <Skeleton width="100%" height={420} radius={0} />
        <View style={styles.loading}>
          {[0, 1, 2, 3].map((row) => (
            <Skeleton key={row} width="100%" height={56} radius={16} />
          ))}
        </View>
      </View>
    );
  }

  if (plan.isError) {
    const code = errorCode(plan.error);
    const missing = code === 'not_found';
    return (
      <EmptyState
        title={
          missing
            ? 'This Plan isn’t available'
            : code === 'network'
              ? 'Can’t reach PlantCircle'
              : 'Something went wrong on our side'
        }
        text={
          missing
            ? 'It may have been cancelled, or the link is wrong.'
            : code === 'network'
              ? 'Check your connection and try again.'
              : 'It’s not you. Try again in a moment.'
        }
        actions={
          <>
            {missing ? null : <Button label="Try again" onPress={() => void plan.refetch()} />}
            <Button
              variant={missing ? 'primary' : 'ghost'}
              label="Back to Home"
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
  barText: { flex: 1, gap: 1 },
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

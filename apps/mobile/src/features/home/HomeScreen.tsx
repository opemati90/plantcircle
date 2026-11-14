import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/Button';
import {
  AlertIcon,
  BellIcon,
  ChevronRightIcon,
  OfflineIcon,
  PinIcon,
  PlusIcon,
} from '../../components/icons';
import { DateTile, EmptyState, Skeleton } from '../../components/parts';
import { Photo } from '../../components/Photo';
import { color, extra, radius, shadow, type } from '../../components/theme';
import { useScreenInsets } from '../../components/useScreenInsets';
import { errorCode } from '../../lib/backend/backend';
import type { Plan, UpNext, WaitlistOffer } from '../../lib/backend/types';
import {
  dayOfMonth,
  dayPart,
  localTime,
  shortWhen,
  time,
  weekdayLong,
  weekdayShort,
} from '../../lib/dates';
import { currentLanguage } from '../../lib/i18n';
import { useAuth } from '../auth/useAuth';
import { PlanListItem } from '../plans/PlanListItem';
import { hasNotice, isFrozen, isPaused } from '../safety/standing';
import { getOnboarding } from '../onboarding/onboardingStore';
import { categoryLabel, placeLabel, priceLabel, spotsLeftShort } from '../plans/planCopy';
import { imageFocus, planImage } from '../plans/planImage';
import {
  useCities,
  useMyPlans,
  usePlansThisWeek,
  useEnsureCity,
  useSetCity,
  useUpNext,
  useWaitlistOffers,
  useOnlinePlans,
} from '../plans/queries';
import { CityPickerSheet } from './CityPickerSheet';
import { filterPlans, HOME_FILTERS, type HomeFilter } from './homeFilters';
import { statusPill } from '../myPlans/myPlanRules';

const SCRIM = {
  colors: [
    'rgba(0,0,0,0.35)',
    'rgba(0,0,0,0)',
    'rgba(0,0,0,0)',
    'rgba(0,0,0,0.9)',
    'rgba(0,0,0,0.94)',
  ],
  locations: [0, 0.18, 0.3, 0.6, 1],
} as const;

function UpNextCard({ plan, needsDish, onPress }: UpNext & { onPress: () => void }) {
  const { t } = useTranslation();
  const when = `${weekdayLong(plan.startsAt, plan.timezone)} ${time(plan.startsAt, plan.timezone)}`;
  const note = needsDish ? t('home.chooseDish') : placeLabel(t, plan);
  return (
    <Pressable accessibilityRole="link" onPress={onPress} style={styles.upNext}>
      <DateTile iso={plan.startsAt} timeZone={plan.timezone} />
      <View style={styles.upNextText}>
        <Text style={[type(13, 'bold', { color: color.brand, tracking: 0.5 }), styles.upper]}>
          {t('home.upNext', { when })}
        </Text>
        <Text style={type(16, 'semibold', { tracking: -0.3 })}>{plan.title}</Text>
        <Text
          style={type(14, needsDish ? 'semibold' : 'regular', {
            color: needsDish ? color.warning : color.secondary,
          })}
        >
          {note}
        </Text>
      </View>
      <ChevronRightIcon size={16} strokeWidth={2.4} color={color.borderControl} />
    </Pressable>
  );
}

/** A spot is being held for the person: the most time-critical thing on Home. */
function OfferCard({ plan, expiresAt, onPress }: WaitlistOffer & { onPress: () => void }) {
  const { t } = useTranslation();
  return (
    <Pressable accessibilityRole="link" onPress={onPress} style={[styles.upNext, styles.offer]}>
      <DateTile iso={plan.startsAt} timeZone={plan.timezone} />
      <View style={styles.upNextText}>
        <Text style={[type(13, 'bold', { color: color.brand, tracking: 0.5 }), styles.upper]}>
          {t('offer.homeLabel', { time: localTime(expiresAt) })}
        </Text>
        <Text style={type(16, 'semibold', { tracking: -0.3 })}>{plan.title}</Text>
        <Text style={type(14, 'regular', { color: color.secondary })}>
          {placeLabel(t, plan)}
        </Text>
      </View>
      <ChevronRightIcon size={16} strokeWidth={2.4} color={color.brand} />
    </Pressable>
  );
}

function FeaturedCard({ plan, onPress }: { plan: Plan; onPress: () => void }) {
  const { t } = useTranslation();
  const tz = plan.timezone;
  const meta = `${time(plan.startsAt, tz)} · ${placeLabel(t, plan)} · ${t('home.hostedBy', { name: plan.hostName })}`;
  return (
    <Pressable accessibilityRole="link" onPress={onPress} style={styles.featured}>
      <Photo source={planImage(plan)} contentPosition={imageFocus(plan)} />
      <LinearGradient {...SCRIM} style={StyleSheet.absoluteFill} />
      <View style={styles.featuredDate}>
        <Text
          allowFontScaling={false}
          style={[type(11, 'bold', { color: '#FFFFFF', tracking: 0.8 }), styles.upper]}
        >
          {weekdayShort(plan.startsAt, tz)}
        </Text>
        <Text
          allowFontScaling={false}
          style={type(24, 'bold', { color: '#FFFFFF', tracking: -0.5, leading: 1 })}
        >
          {dayOfMonth(plan.startsAt, tz)}
        </Text>
      </View>
      <View style={styles.featuredBody}>
        <Text style={[type(13, 'semibold', { color: '#FFFFFF', tracking: 0.2 }), styles.upper]}>
          {categoryLabel(t, plan)} · {priceLabel(t, plan, currentLanguage())}
        </Text>
        <Text style={type(27, 'bold', { color: '#FFFFFF', tracking: -0.8, leading: 1.08 })}>
          {plan.title}
        </Text>
        <Text style={type(15, 'regular', { color: '#FFFFFF' })}>{meta}</Text>
        <View style={styles.featuredFooter}>
          <View style={styles.going}>
            {plan.goingCount > 0 ? (
              <View style={styles.faces}>
                {plan.attendeeInitials.slice(0, 3).map((_, index) => (
                  <View
                    key={index}
                    style={[
                      styles.face,
                      { backgroundColor: extra.tints[index % 3]?.background },
                      index > 0 && styles.faceOverlap,
                    ]}
                  />
                ))}
              </View>
            ) : null}
            <Text style={type(14, 'medium', { color: '#FFFFFF' })}>
              {t('home.going', { count: plan.goingCount })}
            </Text>
          </View>
          <View style={styles.spotsPill}>
            <Text style={type(14, 'semibold')}>{spotsLeftShort(t, plan)}</Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

function RailCard({ plan, onPress }: { plan: Plan; onPress: () => void }) {
  const { t } = useTranslation();
  const when = shortWhen(plan.startsAt, plan.timezone);
  const meta = `${placeLabel(t, plan)} · ${t('home.going', { count: plan.goingCount })}`;
  return (
    <Pressable accessibilityRole="link" onPress={onPress} style={styles.card}>
      <View style={styles.cardImage}>
        <Photo source={planImage(plan)} />
        <View style={styles.cardBadge}>
          <Text style={type(13, 'semibold')}>{when}</Text>
        </View>
      </View>
      <View style={styles.cardText}>
        <Text style={type(16, 'semibold', { tracking: -0.3 })}>{plan.title}</Text>
        <Text style={type(14, 'regular', { color: color.secondary })}>{meta}</Text>
      </View>
    </Pressable>
  );
}

function HomeSkeleton({ top }: { top: number }) {
  const { t } = useTranslation();
  return (
    <View
      role="status"
      accessibilityLabel={t('common.loading')}
      aria-busy
      style={[styles.content, { paddingTop: top }]}
    >
      <View style={[styles.row, styles.spread]}>
        <Skeleton width={96} height={40} radius={999} />
        <View style={styles.headerActions}>
          <Skeleton width={44} height={44} radius={999} />
          <Skeleton width={44} height={44} radius={999} />
        </View>
      </View>
      <View style={[styles.row, styles.stack]}>
        <Skeleton width="40%" height={16} radius={6} />
        <Skeleton width="75%" height={34} radius={8} />
      </View>
      <View style={[styles.row, styles.chips]}>
        <Skeleton width={78} height={36} radius={999} />
        <Skeleton width={78} height={36} radius={999} />
        <Skeleton width={78} height={36} radius={999} />
        <Skeleton width={70} height={36} radius={999} />
      </View>
      <View style={styles.row}>
        <Skeleton width="100%" height={430} radius={28} />
      </View>
    </View>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const insets = useScreenInsets();
  const { session, profile } = useAuth();
  // Signed in: the profile's city. Before sign-up: the city picked during onboarding.
  const cityId = session ? (profile?.cityId ?? null) : getOnboarding().cityId;
  const cities = useCities();
  const cityName = cities.data?.find((city) => city.id === cityId)?.name ?? null;
  const plans = usePlansThisWeek(cityId ? [cityId] : null);
  // A city with nothing this week: online Plans from anywhere this month, to join from home (EmptyCity).
  const emptyCity = Boolean(cityId) && plans.data?.length === 0;
  const anywhere = useOnlinePlans(emptyCity);
  const fromHome = (anywhere.data ?? []).slice(0, 3);
  const upNext = useUpNext();
  const offers = useWaitlistOffers();
  // What the person joined, waits for or hosts: the first few here, the full list on My Plans.
  const mine = useMyPlans('upcoming', Boolean(session));
  const yourPlans = (mine.data ?? []).slice(0, 3);
  const [filter, setFilter] = useState<HomeFilter>('forYou');
  const [cityOpen, setCityOpen] = useState(false);
  const setCity = useSetCity();
  const ensureCity = useEnsureCity();
  const { t } = useTranslation();
  const openPlan = (plan: Plan) => {
    router.push({ pathname: '/plan/[id]', params: { id: plan.id } });
  };

  if (plans.isPending) {
    return (
      <View style={styles.screen}>
        <HomeSkeleton top={insets.top} />
      </View>
    );
  }

  if (plans.isError) {
    const offline = errorCode(plans.error) === 'network';
    return (
      <EmptyState
        onSavedPlans={() => {
          router.push('/my-plans');
        }}
        title={offline ? t('errors.offlineTitle') : t('errors.serverTitle')}
        text={offline ? t('errors.offlineText') : t('errors.serverText')}
        {...(offline ? { icon: <OfflineIcon size={36} strokeWidth={1.7} /> } : {})}
        actions={<Button label={t('common.tryAgain')} onPress={() => void plans.refetch()} />}
      />
    );
  }

  const [featured, ...rest] = filterPlans(plans.data, filter);
  const name = profile?.displayName.split(' ')[0];

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top, paddingBottom: 130 + insets.bottom },
        ]}
      >
        <View style={[styles.row, styles.spread]}>
          <Pressable
            accessibilityRole="button"
            // The name starts with the visible city, so speech input matches what is on screen.
            accessibilityLabel={`${cityName ?? t('home.anywhere')}, ${t('home.changeCity')}`}
            onPress={() => {
              setCityOpen(true);
            }}
            style={styles.chip}
          >
            <PinIcon size={15} strokeWidth={2.3} />
            <Text style={type(15, 'semibold')}>{cityName ?? t('home.anywhere')}</Text>
          </Pressable>
          {session ? (
            <View style={styles.headerActions}>
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={t('home.notifications')}
                onPress={() => {
                  router.push('/my-plans');
                }}
                style={styles.round}
              >
                <BellIcon />
              </Pressable>
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={t('tabs.profile')}
                onPress={() => {
                  router.push('/profile');
                }}
                style={[styles.round, { backgroundColor: extra.tints[0].background }]}
              >
                <Text style={type(15, 'semibold', { color: extra.tints[0].text })}>
                  {name?.charAt(0).toUpperCase() ?? ''}
                </Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              accessibilityRole="link"
              onPress={() => {
                router.push('/sign-up');
              }}
              style={styles.chip}
            >
              <Text style={type(15, 'semibold')}>{t('home.signIn')}</Text>
            </Pressable>
          )}
        </View>

        {hasNotice(profile) ? (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={
              isFrozen(profile) && !isPaused(profile)
                ? t('safety.frozenBanner')
                : t('safety.pausedBanner')
            }
            onPress={() => {
              router.push('/suspended');
            }}
            style={styles.paused}
          >
            <AlertIcon size={18} strokeWidth={2} color="#FFFFFF" />
            <Text style={[type(14, 'semibold', { color: '#FFFFFF' }), styles.pausedText]}>
              {isFrozen(profile) && !isPaused(profile)
                ? t('safety.frozenBanner')
                : t('safety.pausedBanner')}
            </Text>
            <ChevronRightIcon size={16} strokeWidth={2.4} color="#FFFFFF" />
          </Pressable>
        ) : null}
        <View style={[styles.row, styles.heading]}>
          <Text style={type(15, 'medium', { color: color.secondary })}>
            {name
              ? t('home.greetingNamed', {
                  greeting: t(`home.greeting.${dayPart(new Date())}`),
                  name,
                })
              : t(`home.greeting.${dayPart(new Date())}`)}
          </Text>
          <Text
            accessibilityRole="header"
            style={type(34, 'bold', { tracking: -1.1, leading: 1.05 })}
          >
            {cityName ? t('home.titleCity', { city: cityName }) : t('home.title')}
          </Text>
        </View>

        {offers.data?.map((offer) => (
          <OfferCard
            key={offer.plan.id}
            {...offer}
            onPress={() => {
              router.push({
                pathname: '/plan/[id]/waitlist-offer',
                params: { id: offer.plan.id },
              });
            }}
          />
        ))}

        {upNext.data ? (
          <UpNextCard
            {...upNext.data}
            onPress={() => {
              if (upNext.data) openPlan(upNext.data.plan);
            }}
          />
        ) : null}

        {session ? (
          <View style={[styles.row, styles.yourPlans]}>
            <View style={styles.sectionHeader}>
              <Text
                accessibilityRole="header"
                aria-level={2}
                style={type(22, 'bold', { tracking: -0.6 })}
              >
                {t('home.yourPlans')}
              </Text>
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={`${t('home.seeAll')}, ${t('tabs.myPlans')}`}
                hitSlop={12}
                onPress={() => {
                  router.push('/my-plans');
                }}
              >
                <Text style={type(15, 'medium', { color: color.secondary })}>
                  {t('home.seeAll')}
                </Text>
              </Pressable>
            </View>
            {mine.isPending ? (
              <Skeleton width="100%" height={88} radius={radius.card} />
            ) : mine.isError && mine.data === undefined ? (
              <View style={styles.yourPlansNote}>
                <Text role="alert" style={type(15, 'regular', { color: color.secondary })}>
                  {t('errors.serverText')}
                </Text>
                <Button
                  variant="outline"
                  label={t('common.tryAgain')}
                  onPress={() => void mine.refetch()}
                />
              </View>
            ) : yourPlans.length === 0 ? (
              <Text style={type(15, 'regular', { color: color.secondary })}>
                {t('home.yourPlansEmpty')}
              </Text>
            ) : null}
            {yourPlans.map((item) => (
              <PlanListItem
                key={item.plan.id}
                plan={item.plan}
                when={`${weekdayShort(item.plan.startsAt, item.plan.timezone)} ${time(item.plan.startsAt, item.plan.timezone)} · ${placeLabel(t, item.plan)}`}
                pill={statusPill(t, item, false)}
                onPress={() => {
                  if (item.rsvp === 'offered') {
                    router.push({
                      pathname: '/plan/[id]/waitlist-offer',
                      params: { id: item.plan.id },
                    });
                  } else {
                    openPlan(item.plan);
                  }
                }}
              />
            ))}
          </View>
        ) : null}

        <View
          accessibilityRole="radiogroup"
          accessibilityLabel={t('home.filterLabel')}
          style={[styles.row, styles.chips]}
        >
          {HOME_FILTERS.map((option) => {
            const selected = filter === option;
            return (
              <Pressable
                key={option}
                accessibilityRole="radio"
                aria-checked={selected}
                onPress={() => {
                  setFilter(option);
                }}
                style={[styles.filter, selected && styles.filterSelected]}
              >
                <Text
                  style={type(14, selected ? 'semibold' : 'medium', {
                    color: selected ? color.surface : color.ink,
                    tracking: -0.1,
                  })}
                >
                  {t(`home.filters.${option}`)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {featured ? (
          <FeaturedCard
            plan={featured}
            onPress={() => {
              openPlan(featured);
            }}
          />
        ) : emptyCity && cityName ? (
          <View style={[styles.row, styles.emptyCity]}>
            <Text
              accessibilityRole="header"
              aria-level={2}
              style={type(26, 'bold', { tracking: -0.8, leading: 1.1 })}
            >
              {t('home.emptyCityTitle', { city: cityName })}
            </Text>
            <Text style={type(16, 'regular', { color: color.secondary, leading: 1.5 })}>
              {t('home.emptyCityText')}
            </Text>
            <Pressable
              accessibilityRole="link"
              onPress={() => {
                router.push('/create');
              }}
              style={styles.emptyCityCard}
            >
              <View style={styles.emptyCityCardText}>
                <Text style={type(17, 'semibold')}>{t('home.startOwnTitle')}</Text>
                <Text style={type(14, 'regular', { color: color.secondary })}>
                  {t('home.startOwnText')}
                </Text>
              </View>
              <Text
                style={[type(15, 'semibold', { color: '#FFFFFF' }), styles.emptyCityAction]}
              >
                {t('home.startOwnAction')}
              </Text>
            </Pressable>
            {fromHome.length > 0 ? (
              <>
                <Text
                  accessibilityRole="header"
                  aria-level={2}
                  style={[type(20, 'bold', { tracking: -0.5 }), styles.fromHomeTitle]}
                >
                  {t('home.joinFromHome')}
                </Text>
                {fromHome.map((plan) => (
                  <PlanListItem
                    key={plan.id}
                    plan={plan}
                    when={`${weekdayShort(plan.startsAt, plan.timezone)} ${time(plan.startsAt, plan.timezone)} · ${placeLabel(t, plan)}`}
                    onPress={() => {
                      openPlan(plan);
                    }}
                  />
                ))}
              </>
            ) : null}
          </View>
        ) : (
          <Text
            style={[styles.row, type(17, 'regular', { color: color.secondary, leading: 1.5 })]}
          >
            {plans.data.length === 0 ? t('home.emptyWeek') : t('home.emptyFilter')}
          </Text>
        )}

        {rest.length > 0 ? (
          <>
            <View style={[styles.row, styles.sectionHeader]}>
              <Text
                accessibilityRole="header"
                aria-level={2}
                style={type(22, 'bold', { tracking: -0.6 })}
              >
                {t('home.nearYou')}
              </Text>
              <Pressable
                accessibilityRole="link"
                hitSlop={12}
                onPress={() => {
                  router.push('/explore');
                }}
              >
                <Text style={type(15, 'medium', { color: color.secondary })}>
                  {t('home.seeAll')}
                </Text>
              </Pressable>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.rail}
            >
              {rest.map((plan) => (
                <RailCard
                  key={plan.id}
                  plan={plan}
                  onPress={() => {
                    openPlan(plan);
                  }}
                />
              ))}
            </ScrollView>
          </>
        ) : null}
      </ScrollView>

      <CityPickerSheet
        open={cityOpen}
        onClose={() => {
          setCityOpen(false);
        }}
        cities={cities.data ?? []}
        loadError={cities.isError}
        onRetry={() => void cities.refetch()}
        anywhere={{
          label: t('home.anywhere'),
          selected: cityId === null,
          onPress: () => {
            setCity.mutate(null, {
              onSuccess: () => {
                setCityOpen(false);
              },
            });
          },
        }}
        selectedId={cityId}
        failed={setCity.isError}
        saving={setCity.isPending}
        onSelect={(city) => {
          setCity.mutate(city.id, {
            onSuccess: () => {
              setCityOpen(false);
            },
          });
        }}
        onCreate={(name, countryCode, timezone) => {
          ensureCity.mutate(
            { name, countryCode, timezone },
            {
              onSuccess: (city) => {
                setCity.mutate(city.id, {
                  onSuccess: () => {
                    setCityOpen(false);
                  },
                });
              },
            },
          );
        }}
        creating={ensureCity.isPending}
        createFailed={ensureCity.isError}
      />

      <Pressable
        accessibilityRole="link"
        accessibilityLabel={t('home.startPlan')}
        onPress={() => {
          router.push('/create');
        }}
        style={[styles.fab, { bottom: insets.tabBarBottom + 84 }]}
      >
        <PlusIcon size={22} strokeWidth={2.4} color="#FFFFFF" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  emptyCity: { gap: 12 },
  emptyCityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 72,
    padding: 16,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: extra.cardBorder,
  },
  emptyCityCardText: { flex: 1, minWidth: 0, gap: 2 },
  emptyCityAction: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius.pill,
    backgroundColor: color.ink,
    overflow: 'hidden',
  },
  fromHomeTitle: { marginTop: 12 },
  paused: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 48,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: color.ink,
  },
  pausedText: { flex: 1, minWidth: 0 },
  screen: { flex: 1, backgroundColor: color.surface },
  content: { gap: 18 },
  row: { paddingHorizontal: 20 },
  spread: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stack: { gap: 8 },
  upper: { textTransform: 'uppercase' },
  chip: {
    minHeight: 44,
    paddingLeft: 12,
    paddingRight: 14,
    borderRadius: radius.pill,
    backgroundColor: color.fill,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  round: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: color.fill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heading: { gap: 4 },
  upNext: {
    marginHorizontal: 20,
    paddingVertical: 12,
    paddingLeft: 12,
    paddingRight: 14,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: extra.cardBorder,
    backgroundColor: color.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  upNextText: { flex: 1, gap: 3 },
  offer: { borderColor: color.brand, backgroundColor: color.brandTint },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filter: {
    minHeight: 44,
    paddingHorizontal: 15,
    borderRadius: radius.pill,
    backgroundColor: color.fill,
    justifyContent: 'center',
  },
  filterSelected: { backgroundColor: color.ink },
  featured: {
    height: 430,
    marginHorizontal: 20,
    borderRadius: radius.sheet,
    overflow: 'hidden',
    backgroundColor: color.ink,
    boxShadow: shadow.card,
  },
  featuredDate: {
    position: 'absolute',
    top: 14,
    left: 14,
    width: 54,
    paddingTop: 7,
    paddingBottom: 8,
    borderRadius: radius.tile,
    borderWidth: 1,
    borderColor: extra.hairlineOnPhoto,
    backgroundColor: color.glass,
    alignItems: 'center',
  },
  featuredBody: { position: 'absolute', left: 20, right: 20, bottom: 20, gap: 8 },
  featuredFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 6,
  },
  going: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  faces: { flexDirection: 'row' },
  face: {
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.9)',
  },
  faceOverlap: { marginLeft: -9 },
  spotsPill: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: '#FFFFFF',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingTop: 6,
  },
  rail: { paddingHorizontal: 20, gap: 14 },
  yourPlans: { gap: 12 },
  yourPlansNote: { gap: 10 },
  card: { width: 240, gap: 10 },
  cardImage: {
    height: 160,
    borderRadius: radius.card,
    overflow: 'hidden',
    backgroundColor: color.fill,
  },
  cardBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  cardText: { gap: 2, paddingHorizontal: 2 },
  fab: {
    position: 'absolute',
    right: 22,
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: color.ink,
    boxShadow: shadow.fab,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

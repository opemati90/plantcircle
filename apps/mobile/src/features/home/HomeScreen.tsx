import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/Button';
import {
  BellIcon,
  ChevronRightIcon,
  OfflineIcon,
  PinIcon,
  PlusIcon,
} from '../../components/icons';
import { DateTile, EmptyState, Skeleton } from '../../components/parts';
import { Photo } from '../../components/Photo';
import { TabBar } from '../../components/TabBar';
import { color, extra, radius, shadow, type } from '../../components/theme';
import { useScreenInsets } from '../../components/useScreenInsets';
import { errorCode } from '../../lib/backend/backend';
import type { Plan, UpNext } from '../../lib/backend/types';
import {
  dayOfMonth,
  greeting,
  shortWhen,
  time,
  weekdayLong,
  weekdayShort,
} from '../../lib/dates';
import { useAuth } from '../auth/useAuth';
import { getOnboarding } from '../onboarding/onboardingStore';
import { categoryLabel, priceLabel, spotsLeftShort } from '../plans/planCopy';
import { imageFocus, planImage } from '../plans/planImage';
import { useCities, usePlansThisWeek, useUpNext } from '../plans/queries';
import { filterPlans, HOME_FILTERS, type HomeFilter } from './homeFilters';

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
  const when = `${weekdayLong(plan.startsAt, plan.timezone)} ${time(plan.startsAt, plan.timezone)}`;
  const note = needsDish ? 'Choose a dish to bring' : plan.areaName;
  return (
    <Pressable accessibilityRole="link" onPress={onPress} style={styles.upNext}>
      <DateTile iso={plan.startsAt} timeZone={plan.timezone} />
      <View style={styles.upNextText}>
        <Text style={[type(13, 'bold', { color: color.brand, tracking: 0.5 }), styles.upper]}>
          Up next · {when}
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

function FeaturedCard({ plan, onPress }: { plan: Plan; onPress: () => void }) {
  const tz = plan.timezone;
  const meta = `${time(plan.startsAt, tz)} · ${plan.areaName} · hosted by ${plan.hostName}`;
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
          {categoryLabel(plan.category)} · {priceLabel(plan)}
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
              {plan.goingCount} going
            </Text>
          </View>
          <View style={styles.spotsPill}>
            <Text style={type(14, 'semibold')}>{spotsLeftShort(plan)}</Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

function RailCard({ plan, onPress }: { plan: Plan; onPress: () => void }) {
  const when = shortWhen(plan.startsAt, plan.timezone);
  const meta = `${plan.areaName} · ${plan.goingCount} going`;
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
  return (
    <View
      role="status"
      accessibilityLabel="Loading"
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
  const plans = usePlansThisWeek(cityId);
  const upNext = useUpNext();
  const [filter, setFilter] = useState<HomeFilter>('For you');
  const openPlan = (plan: Plan) => {
    router.push({ pathname: '/plans/[planId]', params: { planId: plan.id } });
  };

  if (plans.isPending) {
    return (
      <View style={styles.screen}>
        <HomeSkeleton top={insets.top} />
        <TabBar />
      </View>
    );
  }

  if (plans.isError) {
    const offline = errorCode(plans.error) === 'network';
    return (
      <EmptyState
        title={offline ? 'Can’t reach PlantCircle' : 'Something went wrong on our side'}
        text={
          offline
            ? 'Check your connection and try again.'
            : 'It’s not you. Try again in a moment.'
        }
        {...(offline ? { icon: <OfflineIcon size={36} strokeWidth={1.7} /> } : {})}
        actions={<Button label="Try again" onPress={() => void plans.refetch()} />}
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
          <View style={styles.chip}>
            <PinIcon size={15} strokeWidth={2.3} />
            <Text style={type(15, 'semibold')}>{cityName ?? 'Anywhere'}</Text>
          </View>
          {session ? (
            <View style={styles.headerActions}>
              <Pressable
                accessibilityRole="link"
                accessibilityLabel="Notifications"
                onPress={() => {
                  router.push('/my-plans');
                }}
                style={styles.round}
              >
                <BellIcon />
              </Pressable>
              <Pressable
                accessibilityRole="link"
                accessibilityLabel="Profile"
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
                router.push('/signup');
              }}
              style={styles.chip}
            >
              <Text style={type(15, 'semibold')}>Sign in</Text>
            </Pressable>
          )}
        </View>

        <View style={[styles.row, styles.heading]}>
          <Text style={type(15, 'medium', { color: color.secondary })}>
            {greeting(new Date())}
            {name ? `, ${name}` : ''}
          </Text>
          <Text
            accessibilityRole="header"
            style={type(34, 'bold', { tracking: -1.1, leading: 1.05 })}
          >
            {cityName ? `This week in ${cityName}` : 'This week'}
          </Text>
        </View>

        {upNext.data ? (
          <UpNextCard
            {...upNext.data}
            onPress={() => {
              if (upNext.data) openPlan(upNext.data.plan);
            }}
          />
        ) : null}

        <View
          accessibilityRole="radiogroup"
          accessibilityLabel="Filter Plans"
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
                  {option}
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
        ) : (
          <Text
            style={[styles.row, type(17, 'regular', { color: color.secondary, leading: 1.5 })]}
          >
            {plans.data.length === 0
              ? 'Nothing is planned this week yet.'
              : 'No Plans match this filter this week.'}
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
                Near you
              </Text>
              <Pressable
                accessibilityRole="link"
                hitSlop={12}
                onPress={() => {
                  router.push('/explore');
                }}
              >
                <Text style={type(15, 'medium', { color: color.secondary })}>See all</Text>
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

      <Pressable
        accessibilityRole="link"
        accessibilityLabel="Start a Plan"
        onPress={() => {
          router.push('/create');
        }}
        style={[styles.fab, { bottom: insets.tabBarBottom + 84 }]}
      >
        <PlusIcon size={22} strokeWidth={2.4} color="#FFFFFF" />
      </Pressable>
      <TabBar />
    </View>
  );
}

const styles = StyleSheet.create({
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

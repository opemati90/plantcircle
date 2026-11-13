import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button } from '../../components/Button';
import { OfflineIcon, PinIcon } from '../../components/icons';
import { CityPickerSheet } from '../home/CityPickerSheet';
import { EmptyState, InlineState, Skeleton } from '../../components/parts';
import { color, radius, size, type } from '../../components/theme';
import { useScreenInsets } from '../../components/useScreenInsets';
import { errorCode } from '../../lib/backend/backend';
import type { Plan } from '../../lib/backend/types';
import { time, weekdayShort } from '../../lib/dates';
import { useAuth } from '../auth/useAuth';
import { getOnboarding } from '../onboarding/onboardingStore';
import { placeLabel, spotsLeftShort } from '../plans/planCopy';
import { PlanListItem } from '../plans/PlanListItem';
import { useCities, useExplorePlans } from '../plans/queries';
import { CirclesTab } from '../circles/CirclesTab';
import { LearnTab } from '../learn/LearnTab';
import { PeopleTab } from '../people/PeopleTab';
import { getBrowse, setBrowse, type Browse } from './browseStore';
import { catalogs } from '@plantcircle/copy';
import { currentLanguage } from '../../lib/i18n';
import { activeFilterCount, filterPlans, NO_FILTERS, searchPlans, TRY_INSTEAD, type ExploreTab, type PlanFilters } from './exploreRules';
import { FiltersSheet } from './FiltersSheet';
import { useNow } from '../../lib/useNow';
import { FilterIcon } from '../../components/icons';

const TABS: ExploreTab[] = ['circles', 'plans', 'learn', 'people'];

function PlansTab({
  plans,
  query,
  filters,
  onOpen,
  onClear,
  onTry,
  onHost,
}: {
  plans: Plan[];
  query: string;
  filters: PlanFilters;
  onOpen: (plan: Plan) => void;
  onClear: () => void;
  onTry: (word: string) => void;
  onHost: () => void;
}) {
  const { t } = useTranslation();
  const shown = searchPlans(plans, query);
  const searching = query.trim().length > 0 || activeFilterCount(filters) > 0;
  if (shown.length === 0) {
    // No results, as the NoResults design has it: host it yourself, or try another word.
    return searching ? (
      <View style={styles.noResults}>
        <Text role="status" accessibilityLiveRegion="polite" style={type(13, 'semibold', { color: color.secondary, tracking: 0.4 })}>
          {t('explore.resultsCount', { count: 0 }).toUpperCase()}
        </Text>
        <Text accessibilityRole="header" style={type(22, 'bold', { tracking: -0.6 })}>
          {query.trim() ? t('explore.noResults.title', { query: query.trim() }) : t('explore.noResults.filtersTitle')}
        </Text>
        <Text style={type(15, 'regular', { color: color.secondary, leading: 1.5 })}>{t('explore.noResults.lead')}</Text>
        <View style={styles.noResultsCard}>
          <Text style={type(16, 'semibold')}>{t('explore.noResults.hostTitle')}</Text>
          <Text style={type(14, 'regular', { color: color.secondary, leading: 1.45 })}>{t('explore.noResults.hostText')}</Text>
          <Button variant="outline" label={t('explore.noResults.hostAction')} onPress={onHost} />
        </View>
        <Text style={type(14, 'semibold', { color: color.secondary })}>{t('explore.noResults.tryInstead')}</Text>
        <View style={styles.tryRow}>
          {TRY_INSTEAD.map((word) => (
            <Pressable key={word} accessibilityRole="button" onPress={() => { onTry(t(`explore.noResults.try.${word}`)); }} style={styles.tryChip}>
              <Text style={type(14, 'semibold')}>{t(`explore.noResults.try.${word}`)}</Text>
            </Pressable>
          ))}
        </View>
        <Button variant="ghost" label={t('explore.noResults.clear')} onPress={onClear} />
      </View>
    ) : (
      <InlineState
        title={t('explore.upcomingEmpty.title')}
        text={t('explore.upcomingEmpty.text')}
      />
    );
  }
  return (
    <View style={styles.list}>
      {searching ? (
        <Text role="status" accessibilityLiveRegion="polite" style={type(13, 'semibold', { color: color.secondary, tracking: 0.4 })}>
          {t('explore.resultsCount', { count: shown.length }).toUpperCase()}
        </Text>
      ) : null}
      {shown.map((plan) => (
        <PlanListItem
          key={plan.id}
          plan={plan}
          when={`${weekdayShort(plan.startsAt, plan.timezone)} ${time(plan.startsAt, plan.timezone)} · ${placeLabel(t, plan)}`}
          pill={{
            label: spotsLeftShort(t, plan),
            tone: plan.hasOpenSpot ? 'positive' : 'neutral',
          }}
          onPress={() => {
            onOpen(plan);
          }}
        />
      ))}
    </View>
  );
}

export default function ExploreScreen() {
  const router = useRouter();
  const insets = useScreenInsets();
  const { t } = useTranslation();
  const { session, profile, profileError, retryProfile } = useAuth();
  // Same city rule as Home: the member's city when signed in, else the onboarding choice.
  const cityId = session ? (profile?.cityId ?? null) : getOnboarding().cityId;
  // Browsing is local to this screen and never writes the saved home city. Until the person
  // picks something, Explore follows their home city (no city means Anywhere).
  const [browseChoice, setBrowseState] = useState<Browse | undefined>(getBrowse);
  const setBrowseChoice = (choice: Browse) => {
    setBrowse(choice);
    setBrowseState(choice);
  };
  const [browseOpen, setBrowseOpen] = useState(false);
  // A signed-in profile that is still loading is not the same as "no home city": wait for it.
  // Only a confirmed signed-out visitor (session === null) uses onboarding; while the session
  // or the profile is still loading, the home city is not known yet.
  const homeKnown = session === null || (session !== undefined && profile !== undefined);
  const waiting = browseChoice === undefined && !homeKnown;
  const cities = useCities();
  const allCities = cities.data ?? [];
  const choice: Browse =
    browseChoice ?? (cityId ? { kind: 'city', id: cityId } : { kind: 'anywhere' });
  // The cities whose Plans are shown; null means every city.
  const cityIds: string[] | null =
    choice.kind === 'anywhere'
      ? null
      : choice.kind === 'city'
        ? [choice.id]
        : allCities.filter((city) => city.countryCode === choice.code).map((city) => city.id);
  const countryName =
    choice.kind === 'country'
      ? ((catalogs[currentLanguage()].countries as Record<string, string>)[choice.code] ??
        choice.code)
      : null;
  const cityName =
    choice.kind === 'city'
      ? (allCities.find((city) => city.id === choice.id)?.name ?? null)
      : null;
  // Never show an unknown place as "Anywhere": say it is loading, or that the list failed.
  const browseLabel = waiting
    ? t('city.loading')
    : choice.kind === 'anywhere'
      ? t('explore.anywhere')
      : (countryName ?? cityName ?? (cities.isError ? t('city.loadError') : t('city.loading')));
  const countryReady = choice.kind !== 'country' || cities.isSuccess;
  const plans = useExplorePlans(cityIds, !waiting && countryReady);
  const [tab, setTab] = useState<ExploreTab>('plans');
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<PlanFilters>(NO_FILTERS);
  const [draft, setDraft] = useState<PlanFilters>(NO_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const viewerZone = Intl.DateTimeFormat(currentLanguage()).resolvedOptions().timeZone;
  // The clock ticks, so Today and the weekend roll over at midnight while Explore stays open.
  const now = useNow();
  const filtered = plans.data ? filterPlans(plans.data, filters, now, viewerZone) : [];
  const draftCount = plans.data ? searchPlans(filterPlans(plans.data, draft, now, viewerZone), query).length : 0;
  const activeCount = activeFilterCount(filters);

  function renderContent() {
    // The home city is needed to know what to show; if it cannot load, say so and offer a retry.
    // A country needs the city list to know its cities; if that fails, say so and offer a retry.
    if (choice.kind === 'country' && cities.isError) {
      return (
        <InlineState
          title={t('city.loadError')}
          text={t('errors.serverText')}
          action={<Button label={t('common.tryAgain')} onPress={() => void cities.refetch()} />}
        />
      );
    }
    if (waiting && profileError) {
      return (
        <InlineState
          title={t('errors.serverTitle')}
          text={t('errors.serverText')}
          action={<Button label={t('common.tryAgain')} onPress={retryProfile} />}
        />
      );
    }
    if (tab === 'circles') {
      return <CirclesTab query={query} />;
    }
    if (tab === 'learn') {
      return <LearnTab query={query} />;
    }
    if (tab === 'people') {
      return <PeopleTab />;
    }
    if (plans.isPending) {
      return (
        <View
          role="status"
          accessibilityLabel={t('common.loading')}
          aria-busy
          style={styles.list}
        >
          <Skeleton width="100%" height={110} radius={radius.card} />
          <Skeleton width="100%" height={110} radius={radius.card} />
        </View>
      );
    }
    if (plans.isError) {
      const offline = errorCode(plans.error) === 'network';
      return (
        <EmptyState
          onSavedPlans={() => { router.push('/my-plans'); }}
          title={offline ? t('errors.offlineTitle') : t('errors.serverTitle')}
          text={offline ? t('errors.offlineText') : t('errors.serverText')}
          {...(offline ? { icon: <OfflineIcon size={36} strokeWidth={1.7} /> } : {})}
          actions={<Button label={t('common.tryAgain')} onPress={() => void plans.refetch()} />}
        />
      );
    }
    return (
      <PlansTab
        plans={filtered}
        query={query}
        filters={filters}
        onOpen={(plan) => {
          router.push({ pathname: '/plan/[id]', params: { id: plan.id } });
        }}
        onClear={() => {
          setQuery('');
          setFilters(NO_FILTERS);
          setDraft(NO_FILTERS);
        }}
        onTry={(word) => {
          setQuery(word);
          setFilters(NO_FILTERS);
          setDraft(NO_FILTERS);
        }}
        onHost={() => {
          router.push('/create');
        }}
      />
    );
  }

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top, paddingBottom: 130 + insets.bottom },
      ]}
    >
      <Text accessibilityRole="header" style={type(34, 'bold', { tracking: -1.1 })}>
        {t('tabs.explore')}
      </Text>

      {tab === 'plans' ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${browseLabel}, ${t('explore.browseCity')}`}
          onPress={() => {
            setBrowseOpen(true);
          }}
          style={styles.cityChip}
        >
          <PinIcon size={15} strokeWidth={2.3} />
          <Text style={type(15, 'semibold')}>{browseLabel}</Text>
        </Pressable>
      ) : null}

      {tab === 'plans' || tab === 'circles' || tab === 'learn' ? (
        <View style={styles.searchRow}>
        <TextInput
          accessibilityLabel={
            tab === 'circles'
              ? t('circles.searchLabel')
              : tab === 'learn'
                ? t('learn.searchLabel')
                : t('explore.search')
          }
          placeholder={
            tab === 'circles'
              ? t('circles.searchPlaceholder')
              : tab === 'learn'
                ? t('learn.searchPlaceholder')
                : t('explore.searchPlaceholder')
          }
          placeholderTextColor={color.secondary}
          value={query}
          onChangeText={setQuery}
          returnKeyType="search"
          autoCorrect={false}
          clearButtonMode="while-editing"
          style={[styles.search, styles.grow, type(17)]}
        />
        {tab === 'plans' ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={activeCount > 0 ? t('explore.filters.buttonActive', { count: activeCount }) : t('explore.filters.button')}
            onPress={() => {
              setDraft(filters);
              setFiltersOpen(true);
            }}
            style={[styles.filterButton, activeCount > 0 && styles.filterButtonActive]}
          >
            <FilterIcon size={18} strokeWidth={2} color={activeCount > 0 ? '#FFFFFF' : color.ink} />
            {activeCount > 0 ? <Text style={type(13, 'bold', { color: '#FFFFFF' })}>{activeCount}</Text> : null}
          </Pressable>
        ) : null}
        </View>
      ) : null}
      {tab === 'plans' && activeCount > 0 ? (
        <View style={styles.activeChips}>
          {(['when', 'where', 'price'] as const).filter((k) => filters[k] !== 'any').map((k) => (
            <Pressable
              key={k}
              accessibilityRole="button"
              accessibilityLabel={t('explore.filters.remove', { name: t(`explore.filters.${k}Options.${filters[k]}`) })}
              onPress={() => {
                setFilters({ ...filters, [k]: 'any' });
              }}
              style={styles.activeChip}
            >
              <Text style={type(13, 'semibold')}>{t(`explore.filters.${k}Options.${filters[k]}`)}</Text>
              <Text style={type(13, 'semibold', { color: color.secondary })}>×</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

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
                style={type(14, selected ? 'semibold' : 'medium', {
                  color: selected ? color.ink : color.secondary,
                })}
              >
                {t(`explore.tabs.${key}`)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {renderContent()}
      <FiltersSheet
        open={filtersOpen}
        draft={draft}
        resultCount={draftCount}
        onChange={setDraft}
        onClose={() => {
          setFiltersOpen(false);
        }}
        onApply={() => {
          setFilters(draft);
          setFiltersOpen(false);
        }}
      />
      <CityPickerSheet
        open={browseOpen}
        onClose={() => {
          setBrowseOpen(false);
        }}
        cities={allCities}
        loadError={cities.isError}
        onRetry={() => void cities.refetch()}
        selectedId={choice.kind === 'city' ? choice.id : null}
        selectedCountryCode={choice.kind === 'country' ? choice.code : null}
        failed={false}
        saving={false}
        title={t('explore.browseCity')}
        lead={t('explore.browseLead')}
        anywhere={{
          label: t('explore.anywhere'),
          selected: choice.kind === 'anywhere',
          onPress: () => {
            setBrowseChoice({ kind: 'anywhere' });
            setBrowseOpen(false);
          },
        }}
        onSelect={(city) => {
          setBrowseChoice({ kind: 'city', id: city.id });
          setBrowseOpen(false);
        }}
        onSelectCountry={(group) => {
          setBrowseChoice({ kind: 'country', code: group.countryCode });
          setBrowseOpen(false);
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  grow: { flex: 1, minWidth: 0 },
  filterButton: { minWidth: 48, height: 48, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: radius.control, borderWidth: 1, borderColor: color.borderControl },
  filterButtonActive: { backgroundColor: color.ink, borderColor: color.ink },
  activeChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  activeChip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: size.touchMin, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: color.fill },
  noResults: { gap: 12, paddingTop: 8 },
  noResultsCard: { gap: 8, padding: 16, borderRadius: radius.card, borderWidth: 1, borderColor: color.borderControl },
  tryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tryChip: { minHeight: size.touchMin, paddingHorizontal: 16, justifyContent: 'center', borderRadius: radius.pill, borderWidth: 1, borderColor: color.borderControl },
  screen: { flex: 1, backgroundColor: color.surface },
  content: { paddingHorizontal: 20, gap: 18 },
  search: {
    minHeight: size.touchMin,
    paddingHorizontal: 16,
    borderRadius: radius.control,
    backgroundColor: color.fill,
  },
  cityChip: {
    minHeight: size.touchMin,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: color.fill,
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

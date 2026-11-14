import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button } from '../../components/Button';
import { ScreenHeader } from '../../components/ScreenHeader';
import { Stepper } from '../../components/Stepper';
import { InlineState, Skeleton } from '../../components/parts';
import { color, extra, radius, size, type } from '../../components/theme';
import { Toggle } from '../../components/Toggle';
import { useScreenInsets } from '../../components/useScreenInsets';
import { errorCode } from '../../lib/backend/backend';
import {
  RECIPE_ALLERGENS,
  type PlanFormat,
  type PlanInput,
  type RecipeAllergen,
} from '../../lib/backend/types';
import { longDate, time, timeRange } from '../../lib/dates';
import { useAuth } from '../auth/useAuth';
import { newIdempotencyKey, useCities } from '../plans/queries';
import { HostLevelCard } from '../hosting/HostLevelCard';
import { useHostLevel } from '../hosting/queries';
import { useCreatePlan } from './queries';
import {
  DAY_COUNT,
  DURATION_MINUTES,
  START_MINUTES,
  calendarDay,
  characterCount,
  type CalendarDay,
  isMeetingUrl,
  planWindow,
  startsSoonEnough,
} from './rules';

const STEPS = ['type', 'name', 'when', 'where', 'capacity', 'allergens'] as const;
type Step = (typeof STEPS)[number];
const KINDS: PlanInput['category'][] = ['cooking_night', 'potluck'];
const DEFAULT_START = 18 * 60;
const DEFAULT_DURATION = 120;
const MIN_CAPACITY = 2;
const MAX_CAPACITY = 30;

interface Draft {
  category: PlanInput['category'] | null;
  title: string;
  description: string;
  /** The chosen calendar day in the city. Stored as a date, so it never drifts past midnight. */
  day: CalendarDay | null;
  startMinutes: number;
  duration: number;
  format: PlanFormat;
  areaName: string;
  address: string;
  keepPrivate: boolean;
  meetingUrl: string;
  capacity: number;
  allergens: RecipeAllergen[];
}

const EMPTY: Draft = {
  category: null,
  title: '',
  description: '',
  day: null,
  startMinutes: DEFAULT_START,
  duration: DEFAULT_DURATION,
  format: 'in_person',
  areaName: '',
  address: '',
  keepPrivate: true,
  meetingUrl: '',
  capacity: 8,
  allergens: [],
};

/** Start a Plan: type, name, when, where, how many, allergens. Publishing needs every step. */
export default function CreatePlanScreen() {
  const { t } = useTranslation();
  const insets = useScreenInsets();
  const router = useRouter();
  const { session, profile } = useAuth();
  const cities = useCities();
  const create = useCreatePlan();
  const hostLevel = useHostLevel();
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [index, setIndex] = useState(0);
  const [lateStart, setLateStart] = useState(false);
  const [key, setKey] = useState(newIdempotencyKey);
  // Read on every render, so a start time that was fine when chosen is refused once it is too close.
  const now = new Date();
  const city = cities.data?.find((c) => c.id === profile?.cityId) ?? null;
  const zone = city?.timezone ?? 'UTC';
  const step: Step = STEPS[index] ?? 'type';
  const update = (patch: Partial<Draft>) => {
    setLateStart(false);
    setDraft((current) => ({ ...current, ...patch }));
  };
  const levelMaxCapacity = Math.min(MAX_CAPACITY, hostLevel.data?.maxCapacity ?? MAX_CAPACITY);
  const levelInPerson = hostLevel.data?.inPerson ?? true;
  // A level that cannot host in person or hold the default spots: the draft follows it.
  useEffect(() => {
    // Level 0 has no capacity at all; the gate shows instead, so the draft is left alone.
    if (levelMaxCapacity < MIN_CAPACITY) return;
    setDraft((current) => ({
      ...current,
      format: !levelInPerson && current.format === 'in_person' ? 'online' : current.format,
      capacity: Math.max(MIN_CAPACITY, Math.min(current.capacity, levelMaxCapacity)),
    }));
  }, [levelInPerson, levelMaxCapacity]);

  const window =
    draft.day === null ? null : planWindow(draft.day, draft.startMinutes, draft.duration, zone);
  const meetingValid = isMeetingUrl(draft.meetingUrl.trim());
  const valid: Record<Step, boolean> = {
    type: draft.category !== null,
    name: characterCount(draft.title.trim()) >= 3,
    when: window !== null && startsSoonEnough(window.startsAt, now),
    where:
      draft.format === 'online'
        ? meetingValid
        : draft.areaName.trim().length > 0 && draft.address.trim().length > 0,
    capacity: true,
    allergens: draft.allergens.length > 0,
  };
  const isLast = index === STEPS.length - 1;

  // A changed Plan is a new one, so the key follows the content. A retry of the same Plan keeps it.
  const payloadKey = JSON.stringify({ draft, window: window?.startsAt ?? null });
  useEffect(() => {
    setKey(newIdempotencyKey());
  }, [payloadKey]);

  const publish = () => {
    if (!window || draft.category === null || !valid.allergens || !valid.when) return;
    // The clock may have moved on since the time was chosen: check it again at the last moment.
    if (!startsSoonEnough(window.startsAt, new Date())) {
      setLateStart(true);
      return;
    }
    const online = draft.format === 'online';
    create.mutate(
      {
        key,
        plan: {
          category: draft.category,
          format: draft.format,
          title: draft.title.trim(),
          description: draft.description.trim(),
          startsAt: window.startsAt,
          endsAt: window.endsAt,
          capacity: draft.capacity,
          allergens: draft.allergens,
          areaName: online ? null : draft.areaName.trim(),
          address: online ? null : draft.address.trim(),
          keepAddressPrivate: draft.keepPrivate,
          meetingUrl: online ? draft.meetingUrl.trim() : null,
        },
      },
      {
        onSuccess: (id) => {
          router.replace({ pathname: '/create/published/[id]', params: { id } });
        },
      },
    );
  };

  const back = () => {
    if (index > 0) setIndex(index - 1);
    else if (router.canGoBack()) router.back();
    else router.replace('/home');
  };

  const header = (
    <ScreenHeader
      backLabel={t('common.back')}
      onBack={back}
      caption={t('create.stepOf', { step: index + 1, total: STEPS.length })}
      progress={{ step: index + 1, total: STEPS.length }}
    />
  );

  if (session === undefined) {
    return <View style={styles.screen} />;
  }
  if (session === null) {
    return (
      <View style={styles.screen}>
        {header}
        <InlineState
          title={t('people.signedOut.title')}
          text={t('people.signedOut.text')}
          action={
            <Button
              variant="outline"
              label={t('home.signIn')}
              onPress={() => {
                router.push({ pathname: '/sign-up', params: { next: '/create' } });
              }}
            />
          }
        />
      </View>
    );
  }
  if (cities.isPending || hostLevel.isPending) {
    return (
      <View
        role="status"
        accessibilityLabel={t('common.loading')}
        aria-busy
        style={styles.screen}
      >
        <Skeleton width="100%" height={120} radius={radius.card} />
      </View>
    );
  }
  if (hostLevel.isError) {
    return (
      <View style={styles.screen}>
        {header}
        <InlineState
          title={t('errors.serverTitle')}
          text={t('hosting.levelLoadError')}
          action={
            <Button
              variant="outline"
              label={t('common.tryAgain')}
              onPress={() => void hostLevel.refetch()}
            />
          }
        />
      </View>
    );
  }
  // Hosting is earned: nothing to publish until a recipe is shared (design note §2).
  if (hostLevel.data.level === 0) {
    return (
      <View style={styles.screen}>
        {header}
        <View style={styles.gate}>
          <InlineState
            title={t('hosting.gateTitle')}
            text={t('hosting.gateText')}
            action={
              <Button
                label={t('hosting.gateAction')}
                onPress={() => {
                  router.replace('/recipe/new');
                }}
              />
            }
          />
          <HostLevelCard level={hostLevel.data} />
        </View>
      </View>
    );
  }
  if (!profile?.cityId || !city) {
    return (
      <View style={styles.screen}>
        {header}
        <InlineState
          title={t('create.cityRequired')}
          text={t('home.cityLead')}
          action={
            <Button
              variant="outline"
              label={t('home.changeCity')}
              onPress={() => {
                router.replace('/home');
              }}
            />
          }
        />
      </View>
    );
  }

  const maxCapacity = levelMaxCapacity;
  const inPersonAllowed = levelInPerson;
  const SUBMIT_ERRORS: Partial<Record<string, string>> = {
    city_required: t('create.cityRequired'),
    suspended: t('safety.suspendedErrorDetail'),
    host_level_required: t('hosting.errorRequired'),
    host_level_in_person: t('hosting.errorInPerson'),
    host_level_capacity: t('hosting.errorCapacity'),
  };
  const submitError = create.isError
    ? (SUBMIT_ERRORS[errorCode(create.error)] ?? t('create.error'))
    : null;

  return (
    <View style={styles.screen}>
      {header}
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingBottom: 40 + insets.bottom }]}
      >
        {step === 'type' ? (
          <>
            <Text accessibilityRole="header" style={styles.title}>
              {t('create.typeTitle')}
            </Text>
            <Text style={styles.lead}>{t('create.typeLead')}</Text>
            <View accessibilityRole="radiogroup" style={styles.tiles}>
              {KINDS.map((kind) => {
                const selected = draft.category === kind;
                return (
                  <Pressable
                    key={kind}
                    accessibilityRole="radio"
                    aria-checked={selected}
                    onPress={() => {
                      update({ category: kind });
                    }}
                    style={[styles.tile, selected && styles.tileSelected]}
                  >
                    <Text style={type(17, 'semibold', { tracking: -0.3 })}>
                      {t(`plan.category.${kind}`)}
                    </Text>
                    <Text style={styles.lead}>
                      {kind === 'cooking_night'
                        ? t('create.hintCookingNight')
                        : t('create.hintPotluck')}
                    </Text>
                  </Pressable>
                );
              })}
              <Pressable
                accessibilityRole="link"
                onPress={() => {
                  router.push('/create/order');
                }}
                style={styles.tile}
              >
                <Text style={type(17, 'semibold', { tracking: -0.3 })}>
                  {t('plan.category.group_order')}
                </Text>
                <Text style={styles.lead}>{t('create.hintGroupOrder')}</Text>
              </Pressable>
            </View>
          </>
        ) : null}

        {step === 'name' ? (
          <>
            <Text accessibilityRole="header" style={styles.title}>
              {t('create.nameTitle')}
            </Text>
            <Text style={styles.label}>{t('create.titleLabel')}</Text>
            <TextInput
              accessibilityLabel={t('create.titleLabel')}
              value={draft.title}
              onChangeText={(title) => {
                update({ title });
              }}
              maxLength={80}
              style={[styles.field, type(17)]}
            />
            <Text style={styles.label}>{t('create.descriptionLabel')}</Text>
            <TextInput
              accessibilityLabel={t('create.descriptionLabel')}
              value={draft.description}
              onChangeText={(description) => {
                update({ description });
              }}
              multiline
              maxLength={500}
              style={[styles.area, type(17)]}
            />
          </>
        ) : null}

        {step === 'when' ? (
          <WhenStep draft={draft} now={now} zone={zone} onChange={update} />
        ) : null}

        {step === 'where' ? (
          <>
            <Text accessibilityRole="header" style={styles.title}>
              {t('create.whereTitle')}
            </Text>
            <View
              accessibilityRole="radiogroup"
              accessibilityLabel={t('create.formatGroup')}
              style={styles.segments}
            >
              {(['in_person', 'online'] as const).map((format) => {
                const selected = draft.format === format;
                const locked = format === 'in_person' && !inPersonAllowed;
                return (
                  <Pressable
                    key={format}
                    accessibilityRole="radio"
                    aria-checked={selected}
                    aria-disabled={locked}
                    onPress={() => {
                      if (!locked) update({ format });
                    }}
                    style={[
                      styles.segment,
                      selected && styles.segmentSelected,
                      locked && styles.segmentLocked,
                    ]}
                  >
                    <Text
                      style={type(15, 'semibold', {
                        color: selected ? color.brand : color.ink,
                      })}
                    >
                      {format === 'in_person'
                        ? t('create.formatInPerson')
                        : t('create.formatOnline')}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {!inPersonAllowed ? (
              <Text style={styles.lead}>{t('hosting.inPersonLocked')}</Text>
            ) : null}
            {draft.format === 'in_person' ? (
              <>
                <Text style={styles.label}>{t('create.areaLabel')}</Text>
                <Text style={styles.lead}>{t('create.areaLead')}</Text>
                <TextInput
                  accessibilityLabel={t('create.areaLabel')}
                  value={draft.areaName}
                  onChangeText={(areaName) => {
                    update({ areaName });
                  }}
                  maxLength={60}
                  style={[styles.field, type(17)]}
                />
                <Text style={styles.label}>{t('create.addressLabel')}</Text>
                <TextInput
                  accessibilityLabel={t('create.addressLabel')}
                  value={draft.address}
                  onChangeText={(address) => {
                    update({ address });
                  }}
                  maxLength={200}
                  style={[styles.field, type(17)]}
                />
                <Toggle
                  label={t('create.keepPrivate')}
                  value={draft.keepPrivate}
                  onValueChange={(keepPrivate) => {
                    update({ keepPrivate });
                  }}
                />
                <Text style={styles.lead}>
                  {draft.keepPrivate ? t('create.keepPrivateOn') : t('create.keepPrivateOff')}
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.label}>{t('create.meetLabel')}</Text>
                <Text style={styles.lead}>{t('create.meetLead')}</Text>
                <TextInput
                  accessibilityLabel={t('create.meetLabel')}
                  value={draft.meetingUrl}
                  onChangeText={(meetingUrl) => {
                    update({ meetingUrl });
                  }}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  maxLength={500}
                  style={[styles.field, type(17)]}
                />
                {draft.meetingUrl.trim() && !meetingValid ? (
                  <Text role="alert" style={type(15, 'regular', { color: color.danger })}>
                    {t('create.meetInvalid')}
                  </Text>
                ) : null}
              </>
            )}
          </>
        ) : null}

        {step === 'capacity' ? (
          <>
            <Text accessibilityRole="header" style={styles.title}>
              {t('create.howManyTitle')}
            </Text>
            <Stepper
              value={draft.capacity}
              min={MIN_CAPACITY}
              max={maxCapacity}
              label={t('create.howManyTitle')}
              decreaseLabel={t('learn.fewer')}
              increaseLabel={t('learn.more')}
              onChange={(capacity) => {
                update({ capacity });
              }}
            />
            <Text style={styles.lead}>{t('hosting.capacityNote', { spots: maxCapacity })}</Text>
            <Text style={styles.lead}>{t('create.waitlistNote')}</Text>
          </>
        ) : null}

        {step === 'allergens' ? (
          <>
            <Text accessibilityRole="header" style={styles.title}>
              {t('create.allergensTitle')}
            </Text>
            <Text style={styles.lead}>{t('create.allergensLead')}</Text>
            <View style={styles.chips}>
              {RECIPE_ALLERGENS.map((allergen) => {
                const selected = draft.allergens.includes(allergen);
                return (
                  <Pressable
                    key={allergen}
                    accessibilityRole="checkbox"
                    aria-checked={selected}
                    onPress={() => {
                      update({ allergens: toggleAllergen(draft.allergens, allergen) });
                    }}
                    style={[styles.chip, selected && styles.chipSelected]}
                  >
                    <Text
                      style={type(15, 'semibold', {
                        color: selected ? color.brand : color.ink,
                      })}
                    >
                      {t(`allergen.${allergen}`)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {!valid.allergens ? (
              <Text role="status" style={styles.lead}>
                {t('create.chooseAllergens')}
              </Text>
            ) : null}
            {lateStart ? (
              <Text role="alert" style={type(15, 'regular', { color: color.danger })}>
                {t('create.tooSoon')}
              </Text>
            ) : null}
            {submitError ? (
              <Text role="alert" style={type(15, 'regular', { color: color.danger })}>
                {submitError}
              </Text>
            ) : null}
          </>
        ) : null}

        <View style={styles.footer}>
          {isLast ? (
            <Button
              label={t('create.publish')}
              disabled={
                !valid.allergens || !valid.when || !valid.where || !valid.name || !valid.type
              }
              loading={create.isPending}
              onPress={publish}
            />
          ) : (
            <Button
              label={t('common.continue')}
              disabled={!valid[step]}
              onPress={() => {
                setIndex(index + 1);
              }}
            />
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function toggleAllergen(current: RecipeAllergen[], allergen: RecipeAllergen): RecipeAllergen[] {
  if (current.includes(allergen)) return current.filter((a) => a !== allergen);
  // "None" stands alone: choosing it clears the rest, and choosing another clears "None".
  if (allergen === 'none') return ['none'];
  return [...current.filter((a) => a !== 'none'), allergen];
}

/** The day strip, the start-time grid and the length, with a summary of the chosen window. */
function WhenStep({
  draft,
  now,
  zone,
  onChange,
}: {
  draft: Draft;
  now: Date;
  zone: string;
  onChange: (patch: Partial<Draft>) => void;
}) {
  const { t, i18n } = useTranslation();
  const days = Array.from({ length: DAY_COUNT }, (_, offset) => offset);
  const dayAt = (offset: number) => calendarDay(now, offset, zone);
  const sameDay = (a: CalendarDay | null, b: CalendarDay) =>
    a !== null && a.year === b.year && a.month === b.month && a.day === b.day;
  // The weekday of a calendar date, read in UTC so the clock's zone cannot move it.
  const weekday = (offset: number) => {
    const { year, month, day } = dayAt(offset);
    return new Intl.DateTimeFormat(i18n.language, { weekday: 'short', timeZone: 'UTC' }).format(
      new Date(Date.UTC(year, month - 1, day)),
    );
  };
  const dayNumber = (offset: number) => dayAt(offset).day;
  const startLabel = (minutes: number) =>
    time(planWindow(draft.day ?? dayAt(0), minutes, draft.duration, zone).startsAt, zone);
  const startsOk = (minutes: number) =>
    draft.day !== null &&
    startsSoonEnough(planWindow(draft.day, minutes, draft.duration, zone).startsAt, now);
  const window =
    draft.day === null ? null : planWindow(draft.day, draft.startMinutes, draft.duration, zone);

  return (
    <>
      <Text accessibilityRole="header" style={styles.title}>
        {t('create.whenTitle')}
      </Text>
      <Text style={styles.label}>{t('create.dayGroup')}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        accessibilityRole="radiogroup"
        accessibilityLabel={t('create.dayGroup')}
        contentContainerStyle={styles.dayStrip}
      >
        {days.map((offset) => {
          const selected = sameDay(draft.day, dayAt(offset));
          return (
            <Pressable
              key={offset}
              accessibilityRole="radio"
              aria-checked={selected}
              accessibilityLabel={`${weekday(offset)} ${dayNumber(offset)}`}
              onPress={() => {
                onChange({ day: dayAt(offset) });
              }}
              style={[styles.day, selected && styles.tileSelected]}
            >
              <Text style={type(13, 'semibold', { color: color.secondary })}>
                {weekday(offset)}
              </Text>
              <Text style={type(20, 'semibold', { tracking: -0.4 })}>{dayNumber(offset)}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <Text style={styles.label}>{t('create.startGroup')}</Text>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={t('create.startGroup')}
        style={styles.timeGrid}
      >
        {START_MINUTES.map((minutes) => {
          const selected = draft.startMinutes === minutes;
          const ok = startsOk(minutes);
          return (
            <Pressable
              key={minutes}
              accessibilityRole="radio"
              aria-checked={selected}
              accessibilityState={{ disabled: !ok }}
              disabled={!ok}
              onPress={() => {
                onChange({ startMinutes: minutes });
              }}
              style={[styles.timeCell, selected && styles.chipSelected, !ok && styles.disabled]}
            >
              <Text style={type(15, 'semibold', { color: selected ? color.brand : color.ink })}>
                {startLabel(minutes)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.label}>{t('create.durationGroup')}</Text>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={t('create.durationGroup')}
        style={styles.pill}
      >
        {DURATION_MINUTES.map((minutes) => {
          const selected = draft.duration === minutes;
          return (
            <Pressable
              key={minutes}
              accessibilityRole="radio"
              aria-checked={selected}
              onPress={() => {
                onChange({ duration: minutes });
              }}
              style={[styles.pillItem, selected && styles.pillItemSelected]}
            >
              <Text style={type(15, 'semibold', { color: color.ink })}>
                {t('learn.minutes', { minutes })}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {window ? (
        <Text style={styles.summary}>
          {`${longDate(window.startsAt, zone)} · ${timeRange(window.startsAt, window.endsAt, zone)}`}
        </Text>
      ) : null}
      {window && !startsSoonEnough(window.startsAt, now) ? (
        <Text role="alert" style={type(15, 'regular', { color: color.danger })}>
          {t('create.tooSoon')}
        </Text>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  back: {},
  content: { paddingHorizontal: 24, paddingTop: 8, gap: 12 },
  title: {
    ...type(32, 'bold', { tracking: -1, leading: 1.08 }),
    marginTop: 32,
    marginBottom: 2,
  },
  lead: { ...type(15, 'regular', { color: color.secondary, leading: 1.5 }) },
  label: { ...type(17, 'semibold'), marginTop: 18, marginBottom: 2 },
  field: {
    minHeight: size.touchMin,
    paddingHorizontal: 16,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: extra.cardBorder,
    color: color.ink,
  },
  area: {
    minHeight: 110,
    padding: 14,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: extra.cardBorder,
    textAlignVertical: 'top',
    color: color.ink,
  },
  tiles: { gap: 12 },
  tile: {
    gap: 6,
    padding: 18,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: extra.cardBorder,
  },
  tileSelected: { borderColor: color.brand, backgroundColor: color.brandTint },
  dayStrip: { gap: 8, paddingVertical: 4 },
  day: {
    width: 64,
    minHeight: 72,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: extra.cardBorder,
  },
  segments: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  segment: {
    minHeight: size.touchMin,
    paddingHorizontal: 14,
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: extra.cardBorder,
  },
  segmentSelected: { borderColor: color.brand, backgroundColor: color.brandTint },
  segmentLocked: { opacity: 0.45 },
  gate: { gap: 16 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  timeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  timeCell: {
    width: '31.5%',
    minHeight: size.touchMin,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: extra.cardBorder,
  },
  pill: {
    flexDirection: 'row',
    gap: 4,
    padding: 4,
    borderRadius: 16,
    backgroundColor: color.fill,
  },
  pillItem: {
    flex: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  pillItemSelected: { backgroundColor: color.surface },
  chip: {
    minHeight: size.touchMin,
    minWidth: size.touchMin,
    paddingHorizontal: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: extra.cardBorder,
  },
  chipSelected: { borderColor: color.brand, backgroundColor: color.brandTint },
  disabled: { opacity: 0.35 },
  summary: { ...type(17, 'semibold', { tracking: -0.3 }), marginTop: 4 },
  footer: { paddingTop: 16 },
});

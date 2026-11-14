import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { color, extra, radius, size, type } from '../../components/theme';
import { longDate, time, timeRange } from '../../lib/dates';
import {
  DAY_COUNT,
  DURATION_MINUTES,
  START_MINUTES,
  calendarDay,
  type CalendarDay,
  planWindow,
  startsSoonEnough,
} from './rules';

/** The part of a Plan draft that says when it happens. */
export interface WhenDraft {
  /** The chosen calendar day in the city. Stored as a date, so it never drifts past midnight. */
  day: CalendarDay | null;
  startMinutes: number;
  duration: number;
}

/** The day, start time and length of an existing Plan, as the city reads them. */
export function whenDraftOf(startsAt: string, endsAt: string, timeZone: string): WhenDraft {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
  }).formatToParts(new Date(startsAt));
  const part = (kind: string) => Number(parts.find((p) => p.type === kind)?.value);
  return {
    day: { year: part('year'), month: part('month'), day: part('day') },
    startMinutes: part('hour') * 60 + part('minute'),
    duration: Math.round((Date.parse(endsAt) - Date.parse(startsAt)) / 60_000),
  };
}

/** The day strip, the start-time grid and the length, with a summary of the chosen window. */
export function WhenStep({
  draft,
  now,
  zone,
  onChange,
}: {
  draft: WhenDraft;
  now: Date;
  zone: string;
  onChange: (patch: Partial<WhenDraft>) => void;
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
      <Text maxFontSizeMultiplier={2.0} accessibilityRole="header" style={styles.title}>
        {t('create.whenTitle')}
      </Text>
      <Text maxFontSizeMultiplier={2.0} style={styles.label}>
        {t('create.dayGroup')}
      </Text>
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
              <Text
                maxFontSizeMultiplier={2.0}
                style={type(13, 'semibold', { color: color.secondary })}
              >
                {weekday(offset)}
              </Text>
              <Text
                maxFontSizeMultiplier={1.6}
                style={type(20, 'semibold', { tracking: -0.4 })}
              >
                {dayNumber(offset)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <Text maxFontSizeMultiplier={2.0} style={styles.label}>
        {t('create.startGroup')}
      </Text>
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
              <Text
                maxFontSizeMultiplier={2.0}
                style={type(15, 'semibold', { color: selected ? color.brand : color.ink })}
              >
                {startLabel(minutes)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text maxFontSizeMultiplier={2.0} style={styles.label}>
        {t('create.durationGroup')}
      </Text>
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
              <Text
                maxFontSizeMultiplier={2.0}
                style={type(15, 'semibold', { color: color.ink })}
              >
                {t('learn.minutes', { minutes })}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {window ? (
        <Text maxFontSizeMultiplier={2.0} style={styles.summary}>
          {`${longDate(window.startsAt, zone)} · ${timeRange(window.startsAt, window.endsAt, zone)}`}
        </Text>
      ) : null}
      {window && !startsSoonEnough(window.startsAt, now) ? (
        <Text
          maxFontSizeMultiplier={2.0}
          role="alert"
          style={type(15, 'regular', { color: color.danger })}
        >
          {t('create.tooSoon')}
        </Text>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  title: {
    ...type(32, 'bold', { tracking: -1, leading: 1.08 }),
    marginTop: 32,
    marginBottom: 2,
  },
  label: { ...type(17, 'semibold'), marginTop: 18, marginBottom: 2 },
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
  tileSelected: { borderColor: color.brand, backgroundColor: color.brandTint },
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
  chipSelected: { borderColor: color.brand, backgroundColor: color.brandTint },
  disabled: { opacity: 0.35 },
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
  summary: { ...type(17, 'semibold', { tracking: -0.3 }), marginTop: 4 },
});

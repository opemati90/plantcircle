import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { track } from '../../lib/analytics';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button } from '../../components/Button';
import { BottomSheet, Skeleton } from '../../components/parts';
import { Photo } from '../../components/Photo';
import { color, extra, radius, size, type } from '../../components/theme';
import { errorCode } from '../../lib/backend/backend';
import type { CircleChallenge } from '../../lib/backend/types';
import { weekdayLong } from '../../lib/dates';
import { CHALLENGE_THEMES, themeLabel } from './challengeThemes';
import { newIdempotencyKey } from '../plans/queries';
import { useCircleChallenge, useSetCircleChallenge } from './queries';

const THEME_MAX = 40;

/**
 * The week's challenge at the top of a Circle's feed: the theme, who has cooked it, the latest
 * entries, and one action. Owners and moderators can change the theme for this week.
 */
export function ChallengeCard({ circleId }: { circleId: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const challenge = useCircleChallenge(circleId);
  const [editing, setEditing] = useState(false);
  const seen = Boolean(challenge.data);
  useEffect(() => {
    if (seen) track('challenge_viewed', { surface: 'circle' });
  }, [seen]);

  if (challenge.isPending) return <Skeleton width="100%" height={220} radius={radius.card} />;
  if (challenge.isError) return null;
  const data = challenge.data;
  const theme = themeLabel(t, data.theme, data.weekStart);
  // The week's last day is the Sunday after its Monday, named in the member's language. Taken
  // from the Circle's own week start, so it is right in every time zone.
  const lastDay = weekdayLong(
    new Date(Date.parse(`${data.weekStart}T12:00:00Z`) + 6 * 86_400_000).toISOString(),
    'UTC',
  );

  return (
    <View style={styles.card}>
      <Text
        maxFontSizeMultiplier={2.0}
        style={[type(12, 'bold', { color: extra.onInkMuted, tracking: 1.2 }), styles.upper]}
      >
        {t('cooks.challengeEyebrow')}
      </Text>
      <Text
        maxFontSizeMultiplier={2.0}
        accessibilityRole="header"
        style={type(30, 'bold', { color: color.surface, tracking: -0.9, leading: 1.08 })}
      >
        {theme}
      </Text>
      <Text
        maxFontSizeMultiplier={2.0}
        style={type(15, 'regular', { color: extra.onInkMuted })}
      >
        {data.entrants > 0
          ? t('cooks.challengeEntrants', { count: data.entrants, day: lastDay })
          : t('cooks.challengeFirst', { day: lastDay })}
      </Text>
      {data.entries.length > 0 ? (
        <View style={styles.entries}>
          {data.entries.map((entry) => (
            <Pressable
              key={entry.id}
              accessibilityRole="link"
              accessibilityLabel={`${entry.caption}, ${entry.authorName}`}
              onPress={() => {
                router.push({ pathname: '/cook/[id]', params: { id: entry.id } });
              }}
              style={styles.entry}
            >
              <Photo source={entry.thumb} />
            </Pressable>
          ))}
        </View>
      ) : null}
      <Button
        variant="inverse"
        label={t('cooks.challengeCook')}
        onPress={() => {
          router.push({ pathname: '/cook/new', params: { circle: circleId, challenge: '1' } });
        }}
      />
      {data.canSet ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setEditing(true);
          }}
          style={styles.change}
        >
          <Text
            maxFontSizeMultiplier={2.0}
            style={type(15, 'semibold', { color: extra.onInkMuted })}
          >
            {t('cooks.challengeChange')}
          </Text>
        </Pressable>
      ) : null}
      {editing ? (
        <ThemeSheet
          circleId={circleId}
          challenge={data}
          onClose={() => {
            setEditing(false);
          }}
        />
      ) : null}
    </View>
  );
}

function ThemeSheet({
  circleId,
  challenge,
  onClose,
}: {
  circleId: string;
  challenge: CircleChallenge;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const save = useSetCircleChallenge(circleId);
  const [theme, setTheme] = useState(challenge.theme ?? '');
  // The week the sheet was opened on, kept even if the week turns: a retry never lands on a new one.
  const [week] = useState(challenge.weekStart);
  const trimmed = theme.trim();
  // One key per value, kept across retries, so a lost answer is replayed and never lands on a
  // new week.
  const [keys, setKeys] = useState<Record<string, string>>({});
  const submit = (value: string | null) => {
    const name = value ?? '';
    const key = keys[name] ?? newIdempotencyKey();
    setKeys((all) => ({ ...all, [name]: key }));
    save.mutate({ weekStart: week, theme: value, key }, { onSuccess: onClose });
  };
  return (
    <BottomSheet
      open
      onClose={onClose}
      title={t('cooks.challengeSheetTitle')}
      lead={t('cooks.challengeSheetLead')}
    >
      <TextInput
        maxFontSizeMultiplier={2.0}
        accessibilityLabel={t('cooks.challengeThemeLabel')}
        placeholder={themeLabel(t, null, challenge.weekStart)}
        placeholderTextColor={color.controlOff}
        value={theme}
        onChangeText={setTheme}
        maxLength={THEME_MAX}
        style={[styles.input, type(17)]}
      />
      <View accessibilityLabel={t('cooks.challengeIdeas')} style={styles.ideas}>
        {CHALLENGE_THEMES.map((key) => {
          const label = t(`cooks.themes.${key}`);
          return (
            <Pressable
              key={key}
              accessibilityRole="button"
              onPress={() => {
                setTheme(label);
              }}
              style={[styles.idea, trimmed === label && styles.ideaOn]}
            >
              <Text maxFontSizeMultiplier={2.0} style={type(14, 'medium')}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {save.isError ? (
        <Text
          maxFontSizeMultiplier={2.0}
          role="alert"
          style={type(15, 'regular', { color: color.danger })}
        >
          {errorCode(save.error) === 'network'
            ? t('cooks.errorOffline')
            : errorCode(save.error) === 'challenge_ended'
              ? t('cooks.errorThemeWeekEnded')
              : t('cooks.errorAction')}
        </Text>
      ) : null}
      <Button
        label={t('cooks.challengeSave')}
        loading={save.isPending}
        disabled={trimmed.length === 0}
        onPress={() => {
          submit(trimmed);
        }}
      />
      {challenge.theme ? (
        <Button
          variant="ghost"
          label={t('cooks.challengeUseDefault')}
          disabled={save.isPending}
          onPress={() => {
            submit(null);
          }}
        />
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 10,
    padding: 22,
    borderRadius: radius.card,
    backgroundColor: color.ink,
  },
  upper: { textTransform: 'uppercase' },
  entries: { flexDirection: 'row', gap: 8, paddingVertical: 6 },
  entry: {
    width: 56,
    aspectRatio: 4 / 5,
    borderRadius: radius.control,
    overflow: 'hidden',
    backgroundColor: extra.glassLight,
  },
  change: { minHeight: size.touchMin, justifyContent: 'center', alignSelf: 'center' },
  input: {
    minHeight: 56,
    paddingHorizontal: 16,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: extra.cardBorder,
    color: color.ink,
  },
  ideas: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  idea: {
    minHeight: size.touchMin,
    paddingHorizontal: 14,
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: color.fill,
  },
  ideaOn: { backgroundColor: color.brandTint },
});

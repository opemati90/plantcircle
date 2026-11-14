import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { color, extra, type } from '../../components/theme';
import type { HostLevel, HostStats } from '../../lib/backend/types';

const STAT_KEYS = {
  recipes: 'hosting.statRecipes',
  hosted: 'hosting.statHosted',
  followers: 'hosting.statFollowers',
  upvotes: 'hosting.statUpvotes',
} as const;
const ORDER: (keyof HostStats)[] = ['recipes', 'hosted', 'followers', 'upvotes'];

/**
 * The hosting level as a profile card: the level badge and what it unlocks, then a progress bar
 * for each thing the next level still needs (design note §2). Same card language as the identity
 * card above it: white, 24 radius, 20 padding.
 */
export function HostLevelCard({ level }: { level: HostLevel }) {
  const { t } = useTranslation();
  const name = t(`hosting.levelName_${String(level.level)}` as 'hosting.levelName_0');
  const next = level.next;
  const steps = next
    ? ORDER.filter((key) => next[key] > 0 && level[key] < next[key]).map((key) => ({
        key,
        have: level[key],
        need: next[key],
      }))
    : [];
  return (
    <View style={styles.card} accessibilityRole="summary">
      <View style={styles.head}>
        <View aria-hidden style={styles.badge}>
          <Text
            allowFontScaling={false}
            style={type(24, 'bold', { color: color.brand, tracking: -0.6 })}
          >
            {level.level}
          </Text>
        </View>
        <View style={styles.headText}>
          <Text maxFontSizeMultiplier={1.6} style={type(19, 'semibold', { tracking: -0.4 })}>
            {name}
          </Text>
          <Text
            maxFontSizeMultiplier={2.0}
            style={type(14, 'regular', { color: color.secondary })}
          >
            {t('hosting.levelShort', { level: level.level })}
          </Text>
        </View>
      </View>
      <Text maxFontSizeMultiplier={2.0} style={type(15, 'regular', { color: extra.bodyText })}>
        {t(`hosting.unlocks_${String(level.level)}` as 'hosting.unlocks_0', {
          spots: level.maxCapacity,
        })}
      </Text>
      {next ? (
        <View style={styles.next}>
          <Text
            maxFontSizeMultiplier={1.6}
            style={type(13, 'bold', { color: color.secondary, tracking: 0.5 })}
          >
            {t('hosting.nextTo', {
              name: t(`hosting.levelName_${String(next.level)}` as 'hosting.levelName_0'),
            }).toUpperCase()}
          </Text>
          {steps.map((step) => (
            <View
              key={step.key}
              accessible
              accessibilityRole="progressbar"
              accessibilityLabel={t(STAT_KEYS[step.key])}
              accessibilityValue={{
                min: 0,
                max: step.need,
                now: Math.min(step.have, step.need),
              }}
              style={styles.step}
            >
              <View style={styles.stepRow}>
                <Text maxFontSizeMultiplier={2.0} style={type(15, 'medium')}>
                  {t(STAT_KEYS[step.key])}
                </Text>
                <Text
                  maxFontSizeMultiplier={2.0}
                  style={type(14, 'regular', { color: color.secondary })}
                >
                  {t('hosting.progress', { have: step.have, need: step.need })}
                </Text>
              </View>
              <View aria-hidden style={styles.track}>
                <View
                  style={[
                    styles.fill,
                    {
                      width: `${String(Math.min(100, Math.round((step.have / step.need) * 100)))}%`,
                    },
                  ]}
                />
              </View>
            </View>
          ))}
        </View>
      ) : (
        <Text
          maxFontSizeMultiplier={2.0}
          style={type(15, 'regular', { color: color.secondary })}
        >
          {t('hosting.top')}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: color.surface, borderRadius: 24, padding: 20, gap: 16 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  badge: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: color.brandTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headText: { flex: 1, gap: 2 },
  next: { gap: 14, paddingTop: 16, borderTopWidth: 1, borderTopColor: color.line },
  step: { gap: 8 },
  stepRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: 12,
  },
  track: { height: 6, borderRadius: 3, backgroundColor: color.fill, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3, backgroundColor: color.brand, minWidth: 6 },
});

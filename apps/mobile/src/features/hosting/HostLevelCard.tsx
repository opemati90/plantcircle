import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { color, extra, radius, type } from '../../components/theme';
import type { HostLevel } from '../../lib/backend/types';
import { nextSteps } from './levels';

const NEED_KEYS = {
  recipes: 'hosting.needRecipes',
  hosted: 'hosting.needHosted',
  followers: 'hosting.needFollowers',
  upvotes: 'hosting.needUpvotes',
} as const;

/** The level, what it allows, and what is still missing for the next one (design note §2). */
export function HostLevelCard({ level }: { level: HostLevel }) {
  const { t } = useTranslation();
  const name = t(`hosting.levelName_${String(level.level)}` as 'hosting.levelName_0');
  const steps = nextSteps(level);
  return (
    <View style={styles.card} accessibilityRole="summary">
      <Text style={type(13, 'bold', { color: color.brand, tracking: 0.5 })}>
        {t('hosting.level', { level: level.level, name }).toUpperCase()}
      </Text>
      <Text style={type(16, 'regular', { color: extra.bodyText, leading: 1.45 })}>
        {t(`hosting.unlocks_${String(level.level)}` as 'hosting.unlocks_0', {
          spots: level.maxCapacity,
        })}
      </Text>
      {level.next ? (
        <View style={styles.next}>
          <Text style={type(14, 'semibold', { color: color.secondary })}>
            {t('hosting.nextTitle', { level: level.next.level })}
          </Text>
          {steps.map((step) => (
            <Text key={step.key} style={type(15, 'regular', { leading: 1.4 })}>
              {`· ${t(NEED_KEYS[step.key], { count: step.missing })}`}
            </Text>
          ))}
        </View>
      ) : (
        <Text style={type(15, 'regular', { color: color.secondary, leading: 1.4 })}>
          {t('hosting.top')}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 8,
    padding: 18,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: extra.cardBorder,
    backgroundColor: color.surface,
  },
  next: { gap: 4, paddingTop: 6 },
});

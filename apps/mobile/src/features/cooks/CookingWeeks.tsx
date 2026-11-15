import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronRightIcon, LeafIcon } from '../../components/icons';
import { Skeleton } from '../../components/parts';
import { color, extra, radius, size, type } from '../../components/theme';
import { postsToHost } from '../hosting/levels';
import { useHostLevel } from '../hosting/queries';
import { useCookStreak } from './queries';

/**
 * Profile's cooking card: the weeks in a row you shared what you cooked (honestly named: it
 * counts sharing), your best run, and where hosting stands. Never a reason to feel bad: no
 * "streak lost", just the next step.
 */
export function CookingWeeks() {
  const { t } = useTranslation();
  const router = useRouter();
  const streak = useCookStreak();
  const level = useHostLevel();

  if (streak.isPending) return <Skeleton width="100%" height={150} radius={radius.card} />;
  if (streak.isError) return null;
  const { current, best, weeks } = streak.data;
  const left = level.data ? postsToHost(level.data) : null;

  return (
    <View style={styles.card} accessibilityRole="summary">
      <View style={styles.head}>
        <View aria-hidden style={styles.badge}>
          <LeafIcon size={22} color={color.brand} filled={current > 0} />
        </View>
        <View style={styles.headText}>
          <Text maxFontSizeMultiplier={2.0} style={type(22, 'bold', { tracking: -0.5 })}>
            {current > 0 ? t('cooks.weeksInARow', { count: current }) : t('cooks.weeksStart')}
          </Text>
          <Text
            maxFontSizeMultiplier={2.0}
            style={type(14, 'regular', { color: color.secondary })}
          >
            {weeks > 0 ? t('cooks.weeksSummary', { best, count: weeks }) : t('cooks.weeksNone')}
          </Text>
        </View>
      </View>
      {left === null ? null : (
        <Pressable
          accessibilityRole={left > 0 ? 'link' : undefined}
          disabled={left === 0}
          onPress={() => {
            router.push('/cook/new');
          }}
          style={styles.hosting}
        >
          <Text
            maxFontSizeMultiplier={2.0}
            style={[type(15, 'medium', { color: extra.bodyText }), styles.grow]}
          >
            {left > 0
              ? t('cooks.hostAfter', { count: left })
              : level.data?.inPerson
                ? t('cooks.hostInPerson')
                : t('cooks.hostOnline')}
          </Text>
          {left > 0 ? (
            <ChevronRightIcon size={16} strokeWidth={2.2} color={color.secondary} />
          ) : null}
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 16,
    padding: 20,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: extra.cardBorder,
    backgroundColor: color.surface,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  badge: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: color.brandTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headText: { flex: 1, minWidth: 0, gap: 2 },
  hosting: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: size.touchMin,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: extra.cardBorder,
  },
  grow: { flex: 1 },
});

import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/Button';
import { ChevronRightIcon, OfflineIcon } from '../../components/icons';
import { EmptyState, InlineState, Skeleton } from '../../components/parts';
import { color, extra, radius, size, type } from '../../components/theme';
import { errorCode } from '../../lib/backend/backend';
import type { Circle } from '../../lib/backend/types';
import { useCircles } from '../plans/queries';
import { circleMeta, circleStanding } from './circleRules';

const TONE = {
  positive: { background: color.brandTint, text: color.brand },
  neutral: { background: color.fill, text: color.secondary },
} as const;

function CircleRow({ circle, onPress }: { circle: Circle; onPress: () => void }) {
  const { t } = useTranslation();
  const standing = circleStanding(t, circle);
  return (
    <Pressable accessibilityRole="link" onPress={onPress} style={styles.row}>
      <View style={styles.top}>
        <View style={styles.text}>
          <Text maxFontSizeMultiplier={2.0} style={type(17, 'semibold', { tracking: -0.3 })}>
            {circle.name}
          </Text>
          {circle.tagline ? (
            <Text
              maxFontSizeMultiplier={2.0}
              style={type(15, 'regular', { color: color.secondary })}
            >
              {circle.tagline}
            </Text>
          ) : null}
          <Text
            maxFontSizeMultiplier={2.0}
            style={type(14, 'regular', { color: color.secondary })}
          >
            {circleMeta(t, circle)}
          </Text>
        </View>
        <ChevronRightIcon size={16} strokeWidth={2.4} color={color.borderControl} />
      </View>
      {standing ? (
        <View style={styles.pills}>
          <View style={[styles.pill, { backgroundColor: TONE[standing.tone].background }]}>
            <Text
              maxFontSizeMultiplier={2.0}
              style={type(14, 'semibold', { color: TONE[standing.tone].text })}
            >
              {standing.label}
            </Text>
          </View>
        </View>
      ) : null}
    </Pressable>
  );
}

/** The Circles list in Explore: search, open a Circle, or start one. */
export function CirclesTab({ query }: { query: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const circles = useCircles(query);

  if (circles.isPending) {
    return (
      <View
        role="status"
        accessibilityLabel={t('common.loading')}
        aria-busy
        style={styles.list}
      >
        <Skeleton width="100%" height={96} radius={radius.card} />
        <Skeleton width="100%" height={96} radius={radius.card} />
      </View>
    );
  }
  if (circles.isError) {
    const offline = errorCode(circles.error) === 'network';
    return (
      <EmptyState
        onSavedPlans={() => {
          router.push('/my-plans');
        }}
        title={offline ? t('errors.offlineTitle') : t('errors.serverTitle')}
        text={offline ? t('errors.offlineText') : t('errors.serverText')}
        {...(offline ? { icon: <OfflineIcon size={36} strokeWidth={1.7} /> } : {})}
        actions={<Button label={t('common.tryAgain')} onPress={() => void circles.refetch()} />}
      />
    );
  }

  const shown = circles.data;
  const open = (circle: Circle) => {
    router.push({ pathname: '/circle/[id]', params: { id: circle.id } });
  };
  return (
    <View style={styles.list}>
      {shown.length === 0 ? (
        query.trim() ? (
          <InlineState
            title={t('circles.noResults', { query: query.trim() })}
            text={t('circles.empty.text')}
          />
        ) : (
          <InlineState title={t('circles.empty.title')} text={t('circles.empty.text')} />
        )
      ) : (
        shown.map((circle) => (
          <CircleRow
            key={circle.id}
            circle={circle}
            onPress={() => {
              open(circle);
            }}
          />
        ))
      )}
      <Button
        variant="outline"
        label={t('circles.create')}
        onPress={() => {
          router.push('/circle/new');
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 12 },
  row: {
    gap: 12,
    padding: 14,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: extra.cardBorder,
    backgroundColor: color.surface,
  },
  top: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  text: { flex: 1, minWidth: 0, gap: 3 },
  pills: { flexDirection: 'row' },
  pill: {
    minHeight: size.touchMin - 14,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: radius.pill,
  },
});

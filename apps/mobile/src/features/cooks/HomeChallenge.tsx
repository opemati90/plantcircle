import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/Button';
import { ChevronRightIcon, LeafIcon } from '../../components/icons';
import { Skeleton } from '../../components/parts';
import { Photo } from '../../components/Photo';
import { color, extra, radius, size, type } from '../../components/theme';
import { useAuth } from '../auth/useAuth';
import { useMyCircles } from '../plans/queries';
import { themeLabel } from './challengeThemes';
import { useCircleChallenge } from './queries';

/**
 * The top of This week: your Circle's challenge (the first Circle you are in), with one action.
 * Not in a Circle yet: an invitation to find one, since everything starts there.
 */
export function HomeChallenge() {
  const { t } = useTranslation();
  const router = useRouter();
  const { session } = useAuth();
  const circles = useMyCircles(Boolean(session));
  // Signed out: the invitation, which is also what the app is about.
  const circle = session ? (circles.data?.[0] ?? null) : null;
  const challenge = useCircleChallenge(circle?.id ?? null, circle !== null);

  if ((session && circles.isPending) || (circle && challenge.isPending)) {
    return (
      <View style={styles.row}>
        <Skeleton width="100%" height={200} radius={radius.card} />
      </View>
    );
  }
  if (session && circles.isError) return null;

  if (!circle) {
    return (
      <Pressable
        accessibilityRole="link"
        onPress={() => {
          router.push('/explore');
        }}
        style={({ pressed }) => [styles.invite, pressed && styles.pressed]}
      >
        <View aria-hidden style={styles.inviteIcon}>
          <LeafIcon size={22} color={color.brand} />
        </View>
        <View style={styles.inviteText}>
          <Text maxFontSizeMultiplier={2.0} style={type(17, 'semibold', { tracking: -0.3 })}>
            {t('cooks.joinTitle')}
          </Text>
          <Text
            maxFontSizeMultiplier={2.0}
            style={type(14, 'regular', { color: color.secondary, leading: 1.45 })}
          >
            {t('cooks.joinText')}
          </Text>
        </View>
        <ChevronRightIcon size={16} strokeWidth={2.4} color={color.brand} />
      </Pressable>
    );
  }
  if (challenge.isError || !challenge.data) return null;
  const data = challenge.data;

  return (
    <View style={[styles.row, styles.card]}>
      <Text
        maxFontSizeMultiplier={2.0}
        numberOfLines={2}
        style={[type(12, 'bold', { color: extra.onInkMuted, tracking: 1.2 }), styles.upper]}
      >
        {t('cooks.challengeIn', { circle: circle.name })}
      </Text>
      <Text
        maxFontSizeMultiplier={2.0}
        accessibilityRole="header"
        aria-level={2}
        style={type(30, 'bold', { color: color.surface, tracking: -0.9, leading: 1.08 })}
      >
        {themeLabel(t, data.theme, data.weekStart)}
      </Text>
      <View style={styles.meta}>
        {data.entries.length > 0 ? (
          <View aria-hidden style={styles.faces}>
            {data.entries.slice(0, 3).map((entry, index) => (
              <View key={entry.id} style={[styles.face, index > 0 && styles.faceOverlap]}>
                <Photo source={entry.thumb} />
              </View>
            ))}
          </View>
        ) : null}
        <Text
          maxFontSizeMultiplier={2.0}
          style={[type(15, 'regular', { color: extra.onInkMuted }), styles.grow]}
        >
          {data.entrants > 0
            ? t('cooks.challengeEntrantsShort', { count: data.entrants })
            : t('cooks.challengeFirstShort')}
        </Text>
      </View>
      <View style={styles.actions}>
        <View style={styles.grow}>
          <Button
            variant="inverse"
            label={t('cooks.challengeCook')}
            onPress={() => {
              router.push({
                pathname: '/cook/new',
                params: { circle: circle.id, challenge: '1' },
              });
            }}
          />
        </View>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={t('cooks.challengeSeeEntries', { circle: circle.name })}
          onPress={() => {
            router.push({ pathname: '/circle/[id]', params: { id: circle.id, tab: 'posts' } });
          }}
          style={styles.see}
        >
          <ChevronRightIcon size={20} strokeWidth={2.4} color={color.surface} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { marginHorizontal: 20 },
  card: {
    gap: 10,
    padding: 22,
    borderRadius: radius.sheet,
    backgroundColor: color.ink,
  },
  upper: { textTransform: 'uppercase' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  faces: { flexDirection: 'row' },
  face: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: color.ink,
    backgroundColor: extra.glassLight,
  },
  faceOverlap: { marginLeft: -10 },
  grow: { flex: 1, minWidth: 0 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 6 },
  see: {
    width: 54,
    height: 54,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: extra.hairlineOnPhoto,
    alignItems: 'center',
    justifyContent: 'center',
  },
  invite: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginHorizontal: 20,
    padding: 18,
    borderRadius: radius.card,
    backgroundColor: color.brandTint,
  },
  inviteIcon: {
    width: size.touchMin,
    height: size.touchMin,
    borderRadius: radius.pill,
    backgroundColor: color.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inviteText: { flex: 1, minWidth: 0, gap: 2 },
  pressed: { transform: [{ scale: 0.98 }] },
});

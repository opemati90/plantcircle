import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Button } from '../../components/Button';
import { LeafIcon, PlusIcon } from '../../components/icons';
import { Photo } from '../../components/Photo';
import { Skeleton } from '../../components/parts';
import { color, radius, size, type } from '../../components/theme';
import { CookTile } from './CookCard';
import { useCooks } from './queries';

const RAIL = 10;

/**
 * Home's "Cooked in your Circles": the latest posts as compact tiles, then a tile to share your
 * own. It sits under the featured Plan, so Plans stay first, and ends rather than scrolls.
 */
export function HomeCooks() {
  const { t } = useTranslation();
  const router = useRouter();
  const { fontScale } = useWindowDimensions();
  const cooks = useCooks(null);
  const items = (cooks.data?.pages[0]?.items ?? []).slice(0, RAIL);
  const share = () => {
    router.push('/cook/new');
  };
  // Large text: wider tiles; above 160% a list, so nothing has to be cut short.
  const width = fontScale > 1.3 ? 200 : 148;
  const stacked = fontScale > 1.6;

  if (cooks.isError) return null;

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Text
          maxFontSizeMultiplier={1.6}
          accessibilityRole="header"
          aria-level={2}
          style={[type(22, 'bold', { tracking: -0.6 }), styles.title]}
        >
          {t('cooks.homeTitle')}
        </Text>
        {items.length > 0 ? (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`${t('home.seeAll')}, ${t('cooks.homeTitle')}`}
            hitSlop={12}
            onPress={() => {
              router.push('/cooks');
            }}
          >
            <Text
              maxFontSizeMultiplier={2.0}
              style={type(15, 'medium', { color: color.secondary })}
            >
              {t('home.seeAll')}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {cooks.isPending ? (
        <View style={styles.rail}>
          <Skeleton width={148} height={230} radius={radius.tile} />
          <Skeleton width={148} height={230} radius={radius.tile} />
        </View>
      ) : items.length === 0 ? (
        <Pressable
          accessibilityRole="button"
          onPress={share}
          style={({ pressed }) => [styles.invite, pressed && styles.pressed]}
        >
          <View aria-hidden style={styles.inviteIcon}>
            <LeafIcon size={22} color={color.brand} />
          </View>
          <View style={styles.inviteText}>
            <Text maxFontSizeMultiplier={2.0} style={type(17, 'semibold', { tracking: -0.3 })}>
              {t('cooks.homeEmptyTitle')}
            </Text>
            <Text
              maxFontSizeMultiplier={2.0}
              style={type(14, 'regular', { color: color.secondary, leading: 1.45 })}
            >
              {t('cooks.homeEmptyText')}
            </Text>
          </View>
        </Pressable>
      ) : stacked ? (
        <View style={styles.stack}>
          {items.slice(0, 5).map((cook) => (
            <Pressable
              key={cook.id}
              accessibilityRole="link"
              onPress={() => {
                router.push({ pathname: '/cook/[id]', params: { id: cook.id } });
              }}
              style={styles.stackRow}
            >
              <View style={styles.stackThumb}>
                <Photo source={cook.thumb} />
              </View>
              <View style={styles.stackText}>
                <Text maxFontSizeMultiplier={2.0} style={type(15, 'semibold')}>
                  {cook.caption}
                </Text>
                <Text
                  maxFontSizeMultiplier={2.0}
                  style={type(13, 'regular', { color: color.secondary })}
                >
                  {t('cooks.byIn', {
                    name: cook.mine ? t('cooks.you') : cook.authorName,
                    circle: cook.circleName,
                  })}
                </Text>
              </View>
            </Pressable>
          ))}
          <Button label={t('cooks.shareYours')} onPress={share} />
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.rail}
        >
          {items.map((cook) => (
            <CookTile key={cook.id} cook={cook} width={width} />
          ))}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('cooks.shareYours')}
            onPress={share}
            style={({ pressed }) => [styles.shareTile, { width }, pressed && styles.pressed]}
          >
            <View aria-hidden style={styles.plus}>
              <PlusIcon size={22} strokeWidth={2.4} color={color.surface} />
            </View>
            <Text
              maxFontSizeMultiplier={2.0}
              style={[type(15, 'semibold', { tracking: -0.2 }), styles.center]}
            >
              {t('cooks.shareYours')}
            </Text>
          </Pressable>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 14 },
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 6,
  },
  title: { flexShrink: 1 },
  rail: { flexDirection: 'row', paddingHorizontal: 20, gap: 14 },
  invite: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginHorizontal: 20,
    padding: 16,
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
  shareTile: {
    aspectRatio: 4 / 5,
    alignSelf: 'flex-start',
    borderRadius: radius.tile,
    backgroundColor: color.fill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 14,
  },
  plus: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: color.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { transform: [{ scale: 0.97 }] },
  stack: { paddingHorizontal: 20, gap: 14 },
  stackRow: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: size.touchMin },
  stackThumb: {
    width: 72,
    aspectRatio: 4 / 5,
    borderRadius: radius.control,
    overflow: 'hidden',
    backgroundColor: color.fill,
  },
  stackText: { flex: 1, minWidth: 0, gap: 2 },
  center: { textAlign: 'center' },
});

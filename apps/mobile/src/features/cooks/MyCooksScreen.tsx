import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/Button';
import { LeafIcon } from '../../components/icons';
import { InlineState, Skeleton } from '../../components/parts';
import { Photo } from '../../components/Photo';
import { ScreenHeader } from '../../components/ScreenHeader';
import { color, extra, radius, type } from '../../components/theme';
import { useScreenInsets } from '../../components/useScreenInsets';
import type { Cook } from '../../lib/backend/types';
import { postedAgo } from './postedAgo';
import { useNow } from '../../lib/useNow';
import { CookOptions } from './CookCard';
import { useMyCooks } from './queries';

/** Every post you shared, in any Circle (ones you left too), so you can always take one down. */
export default function MyCooksScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useScreenInsets();
  const now = useNow(60_000);
  const mine = useMyCooks();
  const [selected, setSelected] = useState<Cook | null>(null);
  const posts = mine.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <View style={styles.screen}>
      <ScreenHeader
        backLabel={t('common.back')}
        onBack={() => {
          if (router.canGoBack()) router.back();
          else router.replace('/profile');
        }}
      />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: 40 + insets.bottom }]}
      >
        <Text
          maxFontSizeMultiplier={1.4}
          accessibilityRole="header"
          style={type(30, 'bold', { tracking: -0.9, leading: 1.1 })}
        >
          {t('cooks.mineTitle')}
        </Text>
        {mine.isPending ? (
          <Skeleton width="100%" height={96} radius={radius.card} />
        ) : mine.isError ? (
          <InlineState
            title={t('errors.serverTitle')}
            text={t('errors.serverText')}
            action={
              <Button
                variant="outline"
                label={t('common.retry')}
                onPress={() => void mine.refetch()}
              />
            }
          />
        ) : posts.length === 0 ? (
          <View style={styles.empty}>
            <Text
              maxFontSizeMultiplier={2.0}
              style={type(16, 'regular', { color: color.secondary, leading: 1.5 })}
            >
              {t('cooks.mineEmpty')}
            </Text>
            <Button
              label={t('cooks.shareYours')}
              onPress={() => {
                router.push('/cook/new');
              }}
            />
          </View>
        ) : (
          posts.map((cook) => (
            <View key={cook.id} style={styles.row}>
              <View style={styles.thumb}>
                <Photo source={cook.thumb} />
              </View>
              <View style={styles.text}>
                <Text
                  maxFontSizeMultiplier={2.0}
                  numberOfLines={2}
                  style={type(16, 'semibold')}
                >
                  {cook.caption}
                </Text>
                <Text
                  maxFontSizeMultiplier={2.0}
                  style={type(13, 'regular', { color: color.secondary })}
                >
                  {`${cook.circleName} · ${postedAgo(t, cook.createdAt, now)}`}
                </Text>
                {cook.reactions > 0 ? (
                  <View style={styles.yum}>
                    <LeafIcon size={14} color={color.brand} filled />
                    <Text
                      maxFontSizeMultiplier={2.0}
                      style={type(13, 'semibold', { color: color.secondary })}
                    >
                      {t('cooks.yumCount', { count: cook.reactions })}
                    </Text>
                  </View>
                ) : null}
              </View>
              <Button
                variant="ghost"
                label={t('cooks.deleteShort')}
                accessibilityLabel={t('cooks.deleteNamed', { caption: cook.caption })}
                onPress={() => {
                  setSelected(cook);
                }}
              />
            </View>
          ))
        )}
        {mine.hasNextPage ? (
          <Button
            variant="outline"
            label={t('cooks.showMore')}
            loading={mine.isFetchingNextPage}
            onPress={() => void mine.fetchNextPage()}
          />
        ) : null}
      </ScrollView>
      {selected ? (
        <CookOptions
          cook={selected}
          open
          onClose={() => {
            setSelected(null);
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface },
  content: { paddingHorizontal: 24, paddingTop: 16, gap: 16 },
  empty: { gap: 14 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: extra.cardBorder,
  },
  thumb: {
    width: 64,
    aspectRatio: 4 / 5,
    borderRadius: radius.control,
    overflow: 'hidden',
    backgroundColor: color.fill,
  },
  text: { flex: 1, minWidth: 0, gap: 3 },
  yum: { flexDirection: 'row', alignItems: 'center', gap: 5 },
});

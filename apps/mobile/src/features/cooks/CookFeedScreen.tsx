import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/Button';
import { LeafIcon, OfflineIcon, PlusIcon } from '../../components/icons';
import { EmptyState, Skeleton } from '../../components/parts';
import { ScreenHeader } from '../../components/ScreenHeader';
import { color, radius, type } from '../../components/theme';
import { useScreenInsets } from '../../components/useScreenInsets';
import { errorCode } from '../../lib/backend/backend';
import { useNow } from '../../lib/useNow';
import { CookCard } from './CookCard';
import { useCooks } from './queries';

/** Everything cooked in your Circles, newest first; it ends rather than scrolling forever. */
export default function CookFeedScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useScreenInsets();
  const now = useNow(60_000);
  const cooks = useCooks(null);
  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/home');
  };
  const share = () => {
    router.push('/cook/new');
  };

  if (cooks.isPending) {
    return (
      <View style={styles.screen}>
        <ScreenHeader backLabel={t('common.back')} onBack={goBack} />
        <View
          role="status"
          aria-busy
          accessibilityLabel={t('common.loading')}
          style={styles.skeleton}
        >
          <Skeleton width="60%" height={34} radius={8} />
          <Skeleton width="100%" height={420} radius={radius.card} />
        </View>
      </View>
    );
  }
  if (cooks.isError) {
    const offline = errorCode(cooks.error) === 'network';
    return (
      <View style={styles.screen}>
        <ScreenHeader backLabel={t('common.back')} onBack={goBack} />
        <EmptyState
          title={offline ? t('errors.offlineTitle') : t('errors.serverTitle')}
          text={offline ? t('errors.offlineText') : t('errors.serverText')}
          {...(offline ? { icon: <OfflineIcon size={36} strokeWidth={1.7} /> } : {})}
          actions={<Button label={t('common.tryAgain')} onPress={() => void cooks.refetch()} />}
        />
      </View>
    );
  }

  const items = cooks.data.pages.flatMap((page) => page.items);

  return (
    <View style={styles.screen}>
      <FlatList
        data={items}
        keyExtractor={(cook) => cook.id}
        renderItem={({ item }) => <CookCard cook={item} now={now} />}
        ItemSeparatorComponent={Separator}
        contentContainerStyle={[styles.list, { paddingBottom: 48 + insets.bottom }]}
        refreshControl={
          <RefreshControl
            refreshing={cooks.isRefetching && !cooks.isFetchingNextPage}
            onRefresh={() => void cooks.refetch()}
            tintColor={color.secondary}
          />
        }
        onEndReachedThreshold={0.6}
        onEndReached={() => {
          if (cooks.hasNextPage && !cooks.isFetchingNextPage) void cooks.fetchNextPage();
        }}
        ListHeaderComponent={
          <View style={styles.header}>
            <ScreenHeader backLabel={t('common.back')} onBack={goBack} />
            <View style={styles.titleBlock}>
              <Text
                maxFontSizeMultiplier={1.4}
                accessibilityRole="header"
                style={type(30, 'bold', { tracking: -0.9, leading: 1.1 })}
              >
                {t('cooks.feedTitle')}
              </Text>
              <Text
                maxFontSizeMultiplier={2.0}
                style={type(16, 'regular', { color: color.secondary, leading: 1.45 })}
              >
                {t('cooks.feedLead')}
              </Text>
              <Button
                label={t('cooks.shareYours')}
                icon={<PlusIcon size={18} strokeWidth={2.4} color={color.surface} />}
                onPress={share}
              />
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <LeafIcon size={32} color={color.brand} />
            <Text maxFontSizeMultiplier={1.6} style={type(20, 'bold', { tracking: -0.4 })}>
              {t('cooks.emptyTitle')}
            </Text>
            <Text
              maxFontSizeMultiplier={2.0}
              style={[
                type(15, 'regular', { color: color.secondary, leading: 1.45 }),
                styles.center,
              ]}
            >
              {t('cooks.emptyText')}
            </Text>
          </View>
        }
        ListFooterComponent={
          items.length === 0 ? undefined : cooks.isFetchingNextPage ? (
            <View style={styles.footer}>
              <Skeleton width="100%" height={120} radius={radius.card} />
            </View>
          ) : cooks.hasNextPage ? undefined : (
            <View style={styles.footer}>
              <View aria-hidden style={styles.rule} />
              <Text
                maxFontSizeMultiplier={2.0}
                style={[type(14, 'medium', { color: color.secondary }), styles.center]}
              >
                {t('cooks.caughtUp')}
              </Text>
            </View>
          )
        }
      />
    </View>
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface },
  skeleton: { paddingHorizontal: 24, gap: 18, paddingTop: 16 },
  list: { paddingHorizontal: 24 },
  header: { marginHorizontal: -24, paddingBottom: 28 },
  titleBlock: { paddingHorizontal: 24, paddingTop: 16, gap: 10 },
  separator: { height: 40 },
  empty: { alignItems: 'center', gap: 10, paddingVertical: 40, paddingHorizontal: 12 },
  center: { textAlign: 'center' },
  footer: { paddingTop: 40, gap: 14, alignItems: 'center' },
  rule: { width: 40, height: 3, borderRadius: 2, backgroundColor: color.fill },
});

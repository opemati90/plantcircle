import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/Button';
import { CheckIcon } from '../../components/icons';
import { EmptyState, Skeleton } from '../../components/parts';
import { ScreenHeader } from '../../components/ScreenHeader';
import { color, radius, type } from '../../components/theme';
import { useScreenInsets } from '../../components/useScreenInsets';
import { errorCode } from '../../lib/backend/backend';
import { useNow } from '../../lib/useNow';
import { CookCard } from './CookCard';
import { useCook } from './queries';

/** One post on its own: opened from a feed, Home, a notification, or right after sharing. */
export default function CookScreen() {
  const { id, shared } = useLocalSearchParams<{ id: string; shared?: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useScreenInsets();
  const now = useNow(60_000);
  const cook = useCook(id);
  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/home');
  };
  const header = <ScreenHeader backLabel={t('common.back')} onBack={goBack} />;

  if (cook.isPending) {
    return (
      <View style={styles.screen}>
        {header}
        <View
          role="status"
          aria-busy
          accessibilityLabel={t('common.loading')}
          style={styles.content}
        >
          <Skeleton width="100%" height={460} radius={radius.card} />
        </View>
      </View>
    );
  }
  if (cook.isError) {
    const missing = errorCode(cook.error) === 'not_found';
    return (
      <View style={styles.screen}>
        {header}
        <EmptyState
          title={missing ? t('cooks.notFoundTitle') : t('errors.serverTitle')}
          text={missing ? t('cooks.notFoundText') : t('errors.serverText')}
          actions={
            missing ? (
              <Button
                label={t('cooks.seeFeed')}
                onPress={() => {
                  router.replace('/cooks');
                }}
              />
            ) : (
              <Button label={t('common.retry')} onPress={() => void cook.refetch()} />
            )
          }
        />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {header}
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: 40 + insets.bottom }]}
      >
        {shared === '1' ? (
          <View role="status" style={styles.shared}>
            <CheckIcon size={18} strokeWidth={2.6} color={color.brand} />
            <Text
              maxFontSizeMultiplier={2.0}
              style={[type(15, 'semibold', { color: color.brand }), styles.grow]}
            >
              {t('cooks.sharedWith', { circle: cook.data.circleName })}
            </Text>
          </View>
        ) : null}
        <CookCard cook={cook.data} now={now} onGone={goBack} />
        <Button
          variant="outline"
          label={t('cooks.moreFromCircle', { circle: cook.data.circleName })}
          onPress={() => {
            router.push({
              pathname: '/circle/[id]',
              params: { id: cook.data.circleId, tab: 'posts' },
            });
          }}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface },
  content: { paddingHorizontal: 24, paddingTop: 12, gap: 24 },
  shared: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 48,
    paddingHorizontal: 16,
    borderRadius: radius.control,
    backgroundColor: color.brandTint,
  },
  grow: { flex: 1 },
});

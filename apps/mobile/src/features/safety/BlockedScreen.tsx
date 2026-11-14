import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/Button';
import { ScreenHeader } from '../../components/ScreenHeader';
import { EmptyState, InlineState, Skeleton } from '../../components/parts';
import { color, extra, radius, type } from '../../components/theme';
import { useScreenInsets } from '../../components/useScreenInsets';
import { useAuth } from '../auth/useAuth';
import { useBlocked, useUnblockUser } from './queries';

/** The people you have blocked, and a way back. Nobody on the list is told either way. */
export default function BlockedScreen() {
  const { t } = useTranslation();
  const insets = useScreenInsets();
  const router = useRouter();
  const { session } = useAuth();
  const blocked = useBlocked();
  const unblock = useUnblockUser();

  const back = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/profile/privacy');
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader backLabel={t('common.back')} onBack={back} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: 40 + insets.bottom }]}
      >
        <Text
          maxFontSizeMultiplier={1.4}
          accessibilityRole="header"
          style={type(30, 'bold', { tracking: -0.9, leading: 1.1 })}
        >
          {t('safety.blockedTitle')}
        </Text>
        <Text
          maxFontSizeMultiplier={2.0}
          style={type(16, 'regular', { color: color.secondary, leading: 1.5 })}
        >
          {t('safety.blockedLead')}
        </Text>
        {session === null ? (
          <InlineState
            title={t('people.signedOut.title')}
            text={t('safety.signedOut')}
            action={
              <Button
                variant="outline"
                label={t('home.signIn')}
                onPress={() => {
                  router.push({ pathname: '/sign-up', params: { next: '/profile/blocked' } });
                }}
              />
            }
          />
        ) : blocked.isPending ? (
          <Skeleton width="100%" height={64} radius={radius.card} />
        ) : blocked.isError ? (
          <EmptyState
            onSavedPlans={() => {
              router.push('/my-plans');
            }}
            title={t('errors.serverTitle')}
            text={t('errors.serverText')}
            actions={
              <Button label={t('common.retry')} onPress={() => void blocked.refetch()} />
            }
          />
        ) : blocked.data.length === 0 ? (
          <InlineState
            title={t('safety.blockedEmptyTitle')}
            text={t('safety.blockedEmptyText')}
          />
        ) : (
          <View style={styles.list}>
            {blocked.data.map((person) => (
              <View key={person.userId} style={styles.row}>
                <View
                  aria-hidden
                  style={[styles.avatar, { backgroundColor: extra.tints[2].background }]}
                >
                  <Text
                    allowFontScaling={false}
                    style={type(17, 'bold', { color: extra.tints[2].text })}
                  >
                    {person.displayName.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <Text
                  maxFontSizeMultiplier={2.0}
                  style={[type(16, 'semibold', { tracking: -0.3 }), styles.name]}
                >
                  {person.displayName}
                </Text>
                <Button
                  variant="outline"
                  label={t('safety.unblock')}
                  accessibilityLabel={t('safety.unblockName', { name: person.displayName })}
                  disabled={unblock.isPending}
                  onPress={() => {
                    unblock.mutate(person.userId);
                  }}
                />
              </View>
            ))}
          </View>
        )}
        {unblock.isError ? (
          <Text
            maxFontSizeMultiplier={2.0}
            role="alert"
            style={type(14, 'regular', { color: color.danger })}
          >
            {t('safety.error')}
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface },
  content: { paddingHorizontal: 24, paddingTop: 8, gap: 14 },
  list: { marginTop: 6 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 64,
    borderBottomWidth: 1,
    borderBottomColor: extra.cardBorder,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { flex: 1, minWidth: 0 },
});

import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ChevronRightIcon } from '../../components/icons';
import { ScreenHeader } from '../../components/ScreenHeader';
import { color, extra, radius, type } from '../../components/theme';
import { Toggle } from '../../components/Toggle';
import { useScreenInsets } from '../../components/useScreenInsets';
import { useAuth } from '../auth/useAuth';
import { useSetPeopleVisible } from '../people/queries';

/** Privacy choices. For now: whether members of your Circles can see you in People. */
export default function PrivacyScreen() {
  const { t } = useTranslation();
  const insets = useScreenInsets();
  const router = useRouter();
  const { profile } = useAuth();
  const setVisible = useSetPeopleVisible();
  const visible = profile?.peopleVisible ?? false;
  const shown = setVisible.isPending ? setVisible.variables : visible;

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
          accessibilityRole="header"
          style={type(30, 'bold', { tracking: -0.9, leading: 1.1 })}
        >
          {t('profile.privacyTitle')}
        </Text>
        <Text style={type(17, 'regular', { color: color.secondary, leading: 1.5 })}>
          {t('profile.privacyLead')}
        </Text>
        <View style={styles.card}>
          <Toggle
            label={t('people.visibleTitle')}
            value={shown}
            disabled={!profile || setVisible.isPending}
            onValueChange={(next) => {
              setVisible.mutate(next);
            }}
          />
          <Text style={type(15, 'regular', { color: color.secondary, leading: 1.5 })}>
            {t('people.visibleLead')}
          </Text>
          {setVisible.isError ? (
            <Text role="alert" style={type(15, 'regular', { color: color.danger })}>
              {t('people.error')}
            </Text>
          ) : null}
        </View>
        <Pressable
          accessibilityRole="link"
          onPress={() => {
            router.push({ pathname: '/privacy-choices', params: { from: 'profile' } });
          }}
          style={styles.linkRow}
        >
          <View style={styles.linkText}>
            <Text style={type(17, 'semibold')}>{t('account.privacyChoicesTitle')}</Text>
            <Text style={type(14, 'regular', { color: color.secondary })}>
              {t('account.privacyChoicesRow')}
            </Text>
          </View>
          <ChevronRightIcon size={18} strokeWidth={2.4} color={color.secondary} />
        </Pressable>
        <Pressable
          accessibilityRole="link"
          onPress={() => {
            router.push('/profile/blocked');
          }}
          style={styles.linkRow}
        >
          <View style={styles.linkText}>
            <Text style={type(17, 'semibold')}>{t('safety.blockedTitle')}</Text>
            <Text style={type(14, 'regular', { color: color.secondary })}>
              {t('safety.blockedRowLead')}
            </Text>
          </View>
          <ChevronRightIcon size={18} strokeWidth={2.4} color={color.secondary} />
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 64,
    paddingHorizontal: 16,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: extra.cardBorder,
  },
  linkText: { flex: 1, minWidth: 0, gap: 2 },
  screen: { flex: 1, backgroundColor: color.surface },
  content: { paddingHorizontal: 24, paddingTop: 8, gap: 16 },
  card: {
    gap: 12,
    padding: 16,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: extra.cardBorder,
  },
});

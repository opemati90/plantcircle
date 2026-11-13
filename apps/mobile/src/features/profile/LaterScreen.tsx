import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View, StyleSheet } from 'react-native';
import { Button } from '../../components/Button';
import { ScreenHeader } from '../../components/ScreenHeader';
import { EmptyState } from '../../components/parts';
import { color } from '../../components/theme';

const NAMES = {
  notifications: 'profile.notifications',
  accessibility: 'profile.accessibility',
  hostLevel: 'profile.hostLevel',
  terms: 'profile.terms',
  accountData: 'profile.accountData',
  edit: 'profile.edit',
} as const;

/** A Profile row whose screen comes in a later step (C11, C13). It says so, and offers a way back. */
export default function LaterScreen() {
  const { section } = useLocalSearchParams<{ section: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const key = section in NAMES ? NAMES[section as keyof typeof NAMES] : 'tabs.profile';
  const back = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/profile');
  };
  return (
    <View style={styles.screen}>
      <ScreenHeader backLabel={t('common.back')} onBack={back} />
      <EmptyState
        title={t('profile.laterTitle', { name: t(key) })}
        text={t('profile.laterText')}
        actions={<Button variant="outline" label={t('common.back')} onPress={back} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: color.surface } });

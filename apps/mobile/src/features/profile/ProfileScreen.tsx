import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/Button';
import { color, extra, radius, type } from '../../components/theme';
import { Toggle } from '../../components/Toggle';
import { useScreenInsets } from '../../components/useScreenInsets';
import { useBackend } from '../../lib/backend/BackendProvider';
import { useAuth } from '../auth/useAuth';
import { useSetPeopleVisible } from '../people/queries';

/**
 * The member's own page. Full profile editing comes later; for now it holds the People choice
 * and sign-out.
 */
export default function ProfileScreen() {
  const { t } = useTranslation();
  const insets = useScreenInsets();
  const backend = useBackend();
  const router = useRouter();
  const { profile, session } = useAuth();
  const setVisible = useSetPeopleVisible();
  const logout = useMutation({ mutationFn: () => backend.signOut() });
  const visible = profile?.peopleVisible ?? false;
  // While a change is saving, the switch shows what was asked for; a failure falls back to the server.
  const shown = setVisible.isPending ? setVisible.variables : visible;
  const choiceDisabled = !profile || setVisible.isPending;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 12, paddingBottom: 40 + insets.bottom },
      ]}
    >
      <Text accessibilityRole="header" style={type(30, 'bold', { tracking: -0.9, leading: 1.1 })}>
        {profile?.displayName ?? t('tabs.profile')}
      </Text>

      <View style={styles.card}>
        <Toggle
          label={t('people.visibleTitle')}
          value={shown}
          disabled={choiceDisabled}
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

      {session ? (
        <View style={styles.signOut}>
          <Button
            variant="outline"
            label={t('auth.signOut')}
            loading={logout.isPending}
            onPress={() => {
              logout.mutate(undefined, {
                onSuccess: () => {
                  router.replace('/home');
                },
              });
            }}
          />
          {logout.isError ? (
            <Text role="alert" style={type(15, 'regular', { color: color.danger })}>
              {t('auth.signOutFailed')}
            </Text>
          ) : null}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface },
  content: { paddingHorizontal: 20, gap: 16 },
  card: {
    gap: 12,
    padding: 16,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: extra.cardBorder,
  },
  signOut: { gap: 12, paddingTop: 16 },
});

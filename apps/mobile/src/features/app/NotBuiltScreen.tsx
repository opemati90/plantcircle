import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/parts';
import { TabBar } from '../../components/TabBar';
import { color, type } from '../../components/theme';
import { useBackend } from '../../lib/backend/BackendProvider';
import { useAuth } from '../auth/useAuth';

/**
 * Honest stand-in for v1 areas that are not implemented yet (see README).
 * Profile also hosts sign-out until it is built.
 */
type Area = 'explore' | 'myPlans' | 'inbox' | 'profile' | 'startPlan';

export function NotBuiltScreen({ area, signOut }: { area: Area; signOut?: boolean }) {
  const backend = useBackend();
  const router = useRouter();
  const { session } = useAuth();
  const { t } = useTranslation();
  const name = area === 'startPlan' ? t('home.startPlan') : t(`tabs.${area}`);
  const logout = useMutation({ mutationFn: () => backend.signOut() });

  return (
    <View style={{ flex: 1, backgroundColor: color.surface }}>
      <EmptyState
        title={t('notBuilt.title', { name })}
        text={t('notBuilt.text')}
        actions={
          <>
            <Button
              label={t('common.backToHome')}
              onPress={() => {
                router.replace('/home');
              }}
            />
            {signOut && session ? (
              <Button
                variant="outline"
                label={t('auth.signOut')}
                loading={logout.isPending}
                onPress={() => {
                  logout.mutate();
                }}
              />
            ) : null}
            {logout.isError ? (
              <Text role="alert" style={type(15, 'regular', { color: color.danger })}>
                {t('auth.signOutFailed')}
              </Text>
            ) : null}
          </>
        }
      />
      <TabBar />
    </View>
  );
}

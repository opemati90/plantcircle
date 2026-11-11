import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
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
export function NotBuiltScreen({ name, signOut }: { name: string; signOut?: boolean }) {
  const backend = useBackend();
  const router = useRouter();
  const { session } = useAuth();
  const logout = useMutation({ mutationFn: () => backend.signOut() });

  return (
    <View style={{ flex: 1, backgroundColor: color.surface }}>
      <EmptyState
        title={`${name} isn’t built yet`}
        text="This part of PlantCircle is still in development."
        actions={
          <>
            <Button
              label="Back to Home"
              onPress={() => {
                router.replace('/home');
              }}
            />
            {signOut && session ? (
              <Button
                variant="outline"
                label="Sign out"
                loading={logout.isPending}
                onPress={() => {
                  logout.mutate();
                }}
              />
            ) : null}
            {logout.isError ? (
              <Text role="alert" style={type(15, 'regular', { color: color.danger })}>
                Couldn’t sign out. Try again.
              </Text>
            ) : null}
          </>
        }
      />
      <TabBar />
    </View>
  );
}

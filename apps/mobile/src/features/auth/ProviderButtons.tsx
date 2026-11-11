import { useMutation } from '@tanstack/react-query';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/Button';
import { AppleIcon, GoogleIcon } from '../../components/icons';
import { color, type } from '../../components/theme';
import { errorCode, type OAuthProvider } from '../../lib/backend/backend';
import { useBackend } from '../../lib/backend/BackendProvider';

interface Props {
  /** Called once the person is signed in. */
  onSignedIn: () => void;
  gap?: number;
}

/** "Continue with Apple / Google". */
export function ProviderButtons({ onSignedIn, gap = 10 }: Props) {
  const backend = useBackend();
  const signIn = useMutation({
    mutationFn: (provider: OAuthProvider) => backend.signInWithOAuth(provider),
    onSuccess: onSignedIn,
  });
  // Backing out of the provider sheet is a choice, not an error.
  const failed = signIn.isError && errorCode(signIn.error) !== 'cancelled';

  return (
    <View style={{ gap }}>
      <Button
        label="Continue with Apple"
        icon={<AppleIcon />}
        disabled={signIn.isPending}
        onPress={() => {
          signIn.mutate('apple');
        }}
      />
      <Button
        variant="outline"
        label="Continue with Google"
        icon={<GoogleIcon />}
        disabled={signIn.isPending}
        onPress={() => {
          signIn.mutate('google');
        }}
      />
      {failed ? (
        <Text role="alert" style={styles.error}>
          Couldn’t sign you in. Check your connection and try again.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  error: type(15, 'regular', { color: color.danger, leading: 1.4 }),
});

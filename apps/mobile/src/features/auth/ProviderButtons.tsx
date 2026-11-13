import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/Button';
import { AppleIcon, GoogleIcon } from '../../components/icons';
import { color, type } from '../../components/theme';
import { errorCode, type OAuthProvider } from '../../lib/backend/backend';
import { useBackend } from '../../lib/backend/BackendProvider';
import { AgeConfirm } from './AgeConfirm';

interface Props {
  /** The parent's own age confirmation; when absent the buttons show one themselves. */
  adult?: boolean;
  /** Called once the person is signed in. */
  onSignedIn: () => void;
  gap?: number;
}

/** "Continue with Apple / Google". */
export function ProviderButtons({ onSignedIn, gap = 10, adult }: Props) {
  const [ownAdult, setOwnAdult] = useState(false);
  const confirmed = adult ?? ownAdult;
  const backend = useBackend();
  const { t } = useTranslation();
  const signIn = useMutation({
    mutationFn: (provider: OAuthProvider) => backend.signInWithOAuth(provider),
    onSuccess: onSignedIn,
  });
  // Backing out of the provider sheet is a choice, not an error.
  const failed = signIn.isError && errorCode(signIn.error) !== 'cancelled';

  return (
    <View style={{ gap }}>
      {adult === undefined ? <AgeConfirm value={ownAdult} onValueChange={setOwnAdult} /> : null}
      <Button
        label={t('auth.apple')}
        icon={<AppleIcon />}
        disabled={signIn.isPending || !confirmed}
        onPress={() => {
          signIn.mutate('apple');
        }}
      />
      <Button
        variant="outline"
        label={t('auth.google')}
        icon={<GoogleIcon />}
        disabled={signIn.isPending || !confirmed}
        onPress={() => {
          signIn.mutate('google');
        }}
      />
      {failed ? (
        <Text role="alert" style={styles.error}>
          {t('auth.oauthFailed')}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  error: type(15, 'regular', { color: color.danger, leading: 1.4 }),
});

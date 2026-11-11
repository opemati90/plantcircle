import { useMutation } from '@tanstack/react-query';
import { useBackend } from '../../app/backend';
import type { OAuthProvider } from '../../data/backend';
import { AppleIcon, GoogleIcon } from '../../design/icons';
import ui from '../../design/ui/ui.module.css';
import styles from './auth.module.css';

/** Where the identity provider sends the browser back to. */
export function callbackUrl(next: string): string {
  return `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
}

/** "Continue with Apple / Google". `next` is the in-app path to land on afterwards. */
export function ProviderButtons({ next, inSheet }: { next: string; inSheet?: boolean }) {
  const backend = useBackend();
  const signIn = useMutation({
    mutationFn: (provider: OAuthProvider) =>
      backend.signInWithOAuth(provider, callbackUrl(next)),
  });

  return (
    <div className={inSheet ? styles.providersInSheet : styles.providers}>
      <button
        type="button"
        className={ui.primary}
        disabled={signIn.isPending}
        onClick={() => {
          signIn.mutate('apple');
        }}
      >
        <AppleIcon />
        Continue with Apple
      </button>
      <button
        type="button"
        className={ui.outline}
        disabled={signIn.isPending}
        onClick={() => {
          signIn.mutate('google');
        }}
      >
        <GoogleIcon />
        Continue with Google
      </button>
      {signIn.isError && (
        <p role="alert" className={ui.fieldError}>
          Couldn’t start sign-in. Check your connection and try again.
        </p>
      )}
    </div>
  );
}

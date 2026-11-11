import { useMutation } from '@tanstack/react-query';
import { Link } from 'react-router';
import { ScreenMessage } from '../design/ui/ScreenMessage';
import { TabBar } from '../design/ui/TabBar';
import ui from '../design/ui/ui.module.css';
import { useAuth } from '../features/auth/useAuth';
import { useBackend } from './backend';

/**
 * Honest stand-in for areas of the design that are not implemented yet (tracked
 * in README "Not built yet"). Profile also hosts sign-out until it is built.
 */
export function NotBuiltScreen({ name, signOut }: { name: string; signOut?: boolean }) {
  const backend = useBackend();
  const { session } = useAuth();
  const logout = useMutation({ mutationFn: () => backend.signOut() });

  return (
    <>
      <ScreenMessage
        inline
        title={`${name} isn’t built yet`}
        text="This part of PlantCircle is still in development."
        actions={
          <>
            <Link to="/home" className={ui.primary}>
              Back to Home
            </Link>
            {signOut && session && (
              <button
                type="button"
                className={ui.outline}
                disabled={logout.isPending}
                onClick={() => {
                  logout.mutate();
                }}
              >
                Sign out
              </button>
            )}
            {logout.isError && (
              <p role="alert" className={ui.fieldError}>
                Couldn’t sign out. Try again.
              </p>
            )}
          </>
        }
      />
      <TabBar />
    </>
  );
}

import { Link, Navigate, useSearchParams } from 'react-router';
import { ScreenMessage } from '../../design/ui/ScreenMessage';
import ui from '../../design/ui/ui.module.css';
import { safeNextPath } from './authRules';
import { useAuth } from './useAuth';

/** Landing route after an Apple/Google sign-in round trip. */
export function AuthCallbackScreen() {
  const [params] = useSearchParams();
  const next = safeNextPath(params.get('next'));
  const { session, isLoading } = useAuth();

  if (isLoading) return <main aria-busy="true" aria-label="Signing you in" />;
  if (session) return <Navigate to={next} replace />;

  return (
    <ScreenMessage
      title="Sign-in didn’t complete"
      text="You weren’t signed in. Nothing was saved. Try again."
      actions={
        <Link to={`/signup?next=${encodeURIComponent(next)}`} className={ui.primary}>
          Try again
        </Link>
      }
    />
  );
}

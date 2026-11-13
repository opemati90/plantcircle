import { Redirect, usePathname } from 'expo-router';
import { useAuth } from '../auth/useAuth';
import { usePendingPolicies } from './queries';

/** Routes that stay open while a required version waits: reading it, closing the account, sign-in. */
const OPEN = ['/legal', '/profile/account', '/sign-up', '/verify', '/welcome', '/privacy-choices', '/under-18', '/suspended'];

/**
 * A required policy version that is already in effect blocks the app until it is accepted. When
 * the check itself fails, the gate closes too (the Terms screen offers the retry).
 */
export function PolicyGate() {
  const pathname = usePathname();
  const { session, profileError } = useAuth();
  const pending = usePendingPolicies();
  if (OPEN.some((p) => pathname.startsWith(p))) return null;
  // Without a profile the policies cannot be checked, so a failed profile load closes the gate too.
  const blocking = (!!session && profileError) || pending.isError || (pending.data?.some((p) => p.blocking) ?? false);
  if (!blocking) return null;
  return <Redirect href="/legal/terms" />;
}

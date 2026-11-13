import type { Profile } from '../../lib/backend/types';

/** Paused right now: suspended with no end, or an end still ahead. */
export function isPaused(profile: Profile | undefined | null, now = Date.now()): boolean {
  if (!profile || profile.status !== 'suspended') return false;
  return profile.suspendedUntil === null || Date.parse(profile.suspendedUntil) > now;
}

/** Messages refused right now by a staff decision. */
export function isFrozen(profile: Profile | undefined | null, now = Date.now()): boolean {
  return !!profile?.messagesFrozenUntil && Date.parse(profile.messagesFrozenUntil) > now;
}

/** A notice is due: the account is paused or its messages are frozen. */
export function hasNotice(profile: Profile | undefined | null, now = Date.now()): boolean {
  return isPaused(profile, now) || isFrozen(profile, now);
}

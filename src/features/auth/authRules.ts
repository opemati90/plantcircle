import type { Session } from '../../data/types';

/** Version of the Terms and Community Rules a new member accepts (FR-01). */
export const TERMS_VERSION = '2026-11';

const capitalise = (word: string) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();

/**
 * First name plus last initial ("Ama O."), the way names appear across the app.
 * For email sign-ups only the first word of the address is used, so that a full
 * name or number embedded in an email address is not published.
 */
export function deriveDisplayName(session: Pick<Session, 'email' | 'providerName'>): string {
  const words = (session.providerName ?? '').trim().split(/\s+/).filter(Boolean);
  const [first, ...rest] = words;
  if (first) {
    const last = rest.at(-1);
    return (last ? `${first} ${last.charAt(0).toUpperCase()}.` : first).slice(0, 40);
  }
  const token = /^[\p{L}]+/u.exec(session.email?.split('@')[0] ?? '')?.[0];
  return token ? capitalise(token).slice(0, 40) : 'Member';
}

/** Only same-origin paths may be used as a post-sign-in destination. */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) {
    return '/home';
  }
  return next;
}

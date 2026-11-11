import type { Plan, PlanDetail, Profile, ProfileInput, Session, UpNext } from './types';

export type BackendErrorCode =
  | 'network'
  | 'not_authenticated'
  | 'not_found'
  | 'plan_full'
  | 'plan_ended'
  | 'item_taken'
  | 'rsvp_required'
  | 'invalid_code'
  | 'rate_limited'
  | 'invalid_response'
  | 'unknown';

export class BackendError extends Error {
  readonly code: BackendErrorCode;

  constructor(code: BackendErrorCode, message?: string, options?: ErrorOptions) {
    super(message ?? code, options);
    this.name = 'BackendError';
    this.code = code;
  }
}

export function errorCode(error: unknown): BackendErrorCode {
  return error instanceof BackendError ? error.code : 'unknown';
}

export type OAuthProvider = 'apple' | 'google';

/**
 * Everything the UI needs from a backend. The Supabase adapter is the real one;
 * the fixtures adapter exists only for local development and tests.
 */
export interface Backend {
  readonly kind: 'supabase' | 'fixtures';

  getSession(): Promise<Session | null>;
  onSessionChange(listener: (session: Session | null) => void): () => void;
  /** Starts the provider flow; the browser returns to `returnTo` (an in-app URL). */
  signInWithOAuth(provider: OAuthProvider, returnTo: string): Promise<void>;
  requestEmailCode(email: string): Promise<void>;
  verifyEmailCode(email: string, code: string): Promise<void>;
  signOut(): Promise<void>;

  getProfile(): Promise<Profile | null>;
  createProfile(input: ProfileInput): Promise<Profile>;

  listUpcomingPlans(query: { city: string; from: Date; to: Date }): Promise<Plan[]>;
  getPlan(planId: string): Promise<PlanDetail>;
  getUpNext(now: Date): Promise<UpNext | null>;
  joinPlan(planId: string): Promise<void>;
  cancelRsvp(planId: string): Promise<void>;
  claimBringItem(itemId: string): Promise<void>;
}

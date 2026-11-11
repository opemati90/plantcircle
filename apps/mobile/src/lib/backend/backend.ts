import type { City, Plan, PlanDetail, Profile, ProfileInput, Session, UpNext } from './types';

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
  | 'cancelled'
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
  /** Resolves once signed in; rejects with `cancelled` if the person backs out. */
  signInWithOAuth(provider: OAuthProvider): Promise<void>;
  requestEmailCode(email: string): Promise<void>;
  verifyEmailCode(email: string, code: string): Promise<void>;
  signOut(): Promise<void>;

  getProfile(): Promise<Profile | null>;
  createProfile(input: ProfileInput): Promise<Profile>;

  listCities(): Promise<City[]>;
  /** `cityId: null` lists Plans everywhere (the member has not picked a city). */
  listUpcomingPlans(query: { cityId: string | null; from: Date; to: Date }): Promise<Plan[]>;
  getPlan(planId: string): Promise<PlanDetail>;
  getUpNext(now: Date): Promise<UpNext | null>;
  // State-changing calls take an idempotency key: one key per user action, reused on retry.
  joinPlan(planId: string, idempotencyKey: string): Promise<void>;
  cancelRsvp(planId: string, idempotencyKey: string): Promise<void>;
  claimBringItem(itemId: string, idempotencyKey: string): Promise<void>;
}

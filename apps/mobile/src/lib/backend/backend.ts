import type {
  City,
  OfferOutcome,
  Plan,
  PlanDetail,
  Profile,
  ProfileInput,
  Session,
  UpNext,
  WaitlistOffer,
} from './types';

export type BackendErrorCode =
  | 'network'
  | 'not_authenticated'
  | 'not_found'
  | 'plan_full'
  | 'plan_ended'
  | 'item_taken'
  | 'rsvp_required'
  | 'no_offer'
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
  /** Gives up a spot, a place in line, or an offered spot ("pass it on"). */
  cancelRsvp(planId: string, idempotencyKey: string): Promise<void>;
  joinWaitlist(planId: string, idempotencyKey: string): Promise<void>;
  confirmWaitlistOffer(planId: string, idempotencyKey: string): Promise<OfferOutcome>;
  /** Spots currently held for the viewer, soonest expiry first. */
  getWaitlistOffers(): Promise<WaitlistOffer[]>;
  claimBringItem(itemId: string, idempotencyKey: string): Promise<void>;
}

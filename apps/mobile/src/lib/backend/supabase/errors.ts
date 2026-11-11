import { BackendError, type BackendErrorCode } from '../backend';

const DOMAIN_ERRORS: Record<string, BackendErrorCode> = {
  not_authenticated: 'not_authenticated',
  profile_required: 'not_authenticated',
  plan_not_found: 'not_found',
  item_not_found: 'not_found',
  plan_full: 'plan_full',
  plan_ended: 'plan_ended',
  item_taken: 'item_taken',
  rsvp_required: 'rsvp_required',
};

interface ErrorLike {
  message: string;
  status?: number | undefined;
  code?: string | undefined;
}

/** Maps Supabase/PostgREST failures to the app's small set of error codes. */
export function toBackendError(error: ErrorLike): BackendError {
  const domain = DOMAIN_ERRORS[error.message];
  if (domain) return new BackendError(domain, error.message);
  if (/failed to fetch|networkerror|load failed/i.test(error.message)) {
    return new BackendError('network', error.message);
  }
  if (error.status === 429) return new BackendError('rate_limited', error.message);
  if (error.status === 401 || error.code === 'PGRST301') {
    return new BackendError('not_authenticated', error.message);
  }
  return new BackendError('unknown', error.message);
}

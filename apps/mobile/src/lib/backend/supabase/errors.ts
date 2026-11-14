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
  no_offer: 'no_offer',
  rate_limited: 'rate_limited',
  circle_not_found: 'not_found',
  request_not_found: 'not_found',
  not_moderator: 'forbidden',
  invalid_recipe: 'invalid_input',
  allergens_required: 'invalid_input',
  invalid_plan: 'invalid_input',
  city_required: 'city_required',
  feedback_exists: 'invalid_input',
  request_cooldown: 'request_cooldown',
  last_owner: 'invalid_input',
  city_not_found: 'city_not_found',
  host_level_required: 'host_level_required',
  host_level_in_person: 'host_level_in_person',
  host_level_capacity: 'host_level_capacity',
  own_recipe: 'own_recipe',
  not_host: 'forbidden',
  checkin_closed: 'checkin_closed',
  plan_not_started: 'plan_not_started',
  plan_not_live: 'invalid_input',
  guest_not_found: 'not_found',
  feedback_not_open: 'invalid_input',
  invalid_feedback: 'invalid_input',
  invalid_item: 'invalid_input',
  quantity_below_claims: 'invalid_input',
  item_claimed: 'item_claimed',
  invalid_message: 'invalid_input',
  not_member: 'closed_chat',
  person_not_found: 'person_not_found',
  invalid_order: 'invalid_input',
  invalid_quantity: 'invalid_input',
  invalid_decision: 'invalid_input',
  interest_closed: 'interest_closed',
  order_not_open: 'order_not_open',
  order_not_ready: 'order_not_open',
  blocked: 'blocked',
  suspended: 'suspended',
  messages_frozen: 'messages_frozen',
  account_deleted: 'account_deleted',
  host_cannot_join: 'invalid_input',
  invalid_settings: 'invalid_input',
  unknown_policy_version: 'invalid_input',
  invalid_policy_set: 'invalid_input',
  invalid_report: 'invalid_input',
  target_not_found: 'not_found',
  action_not_found: 'not_found',
  invalid_appeal: 'invalid_input',
  already_appealed: 'invalid_input',
  not_staff: 'forbidden',
  report_not_found: 'not_found',
  report_closed: 'invalid_input',
  reason_required: 'invalid_input',
  appeal_not_found: 'not_found',
  appeal_closed: 'invalid_input',
  same_reviewer: 'forbidden',
};

export interface ErrorLike {
  message: string;
  status?: number | undefined;
  code?: string | undefined;
}

/** Maps Supabase/PostgREST failures to the app's small set of error codes. */
export function toBackendError(error: ErrorLike): BackendError {
  const domain = DOMAIN_ERRORS[error.message];
  if (domain) return new BackendError(domain, error.message);
  if (
    /failed to fetch|networkerror|network request failed|load failed|internet connection appears to be offline|timed out/i.test(
      error.message,
    )
  ) {
    return new BackendError('network', error.message);
  }
  if (error.status === 429) return new BackendError('rate_limited', error.message);
  if (error.status === 401 || error.code === 'PGRST301') {
    return new BackendError('not_authenticated', error.message);
  }
  return new BackendError('unknown', error.message);
}

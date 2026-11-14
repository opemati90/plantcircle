import { createClient, type Session as SupabaseSession } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { AppState, Platform } from 'react-native';
import { z } from 'zod';
import { sessionStorage } from '../../storage';
import { BackendError, type Backend, type BackendErrorCode } from '../backend';
import { toBackendError, type ErrorLike } from './errors';
import { containsPattern } from './search';
import {
  bringItemCardSchema,
  cityRowSchema,
  circleCardSchema,
  circleRequestSchema,
  toCircle,
  toCircleRequest,
  guestRowSchema,
  messageCardSchema,
  messageRequestCardSchema,
  inboxRowSchema,
  ORDER_STATES,
  orderCardSchema,
  orderItemCardSchema,
  toInboxThread,
  personRowSchema,
  toDirectRequest,
  toChatMessage,
  recipeCardSchema,
  toGuest,
  recipeIngredientSchema,
  toPerson,
  toRecipe,
  planCardSchema,
  toPlan,
  auditRowSchema,
  notificationRowSchema,
  toNotification,
  PROFILE_GOALS,
  profileStatsSchema,
  pendingPolicySchema,
  toPendingPolicy,
  settingsPatchToRow,
  settingsSchema,
  toSettings,
  staffAppealSchema,
  staffCaseSchema,
  staffQueueRowSchema,
  suspensionSchema,
  type Plan,
  type Profile,
  type RsvpState,
  type Session,
  type StaffQueueRow,
  hostLevelSchema,
  toHostLevel,
} from '../types';

function parse<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) throw new BackendError('invalid_response', result.error.message);
  return result.data;
}

function toSession(session: SupabaseSession | null): Session | null {
  if (!session) return null;
  const metadata: Record<string, unknown> = session.user.user_metadata;
  const name = metadata.full_name ?? metadata.name;
  return {
    userId: session.user.id,
    email: session.user.email ?? null,
    providerName: typeof name === 'string' ? name : null,
  };
}

const profileRowSchema = z.object({
  display_name: z.string(),
  city_id: z.string().nullable(),
  goals: z.array(z.string()),
  people_visible: z.boolean(),
  status: z.enum(['active', 'suspended', 'deleted']),
  suspended_until: z.string().nullable(),
  messages_frozen_until: z.string().nullable(),
  role: z.enum(['member', 'staff']),
});
const settingsRowSchema = z.object({
  muted_until: z.string().nullable(),
  pinned_at: z.string().nullable(),
});
const PROFILE_COLUMNS =
  'display_name, city_id, goals, people_visible, status, suspended_until, messages_frozen_until, role';

/**
 * Calls an Edge Function and reads its answer, including the error word in a non-2xx body
 * (the SDK hides it behind a generic error).
 */
type FunctionsClient = {
  functions: {
    invoke: (
      name: string,
      options: { body: Record<string, unknown> },
    ) => Promise<{ data: unknown; error: unknown }>;
  };
};

async function invokeFunction(
  client: FunctionsClient,
  name: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  const result = await client.functions.invoke(name, { body });
  if (result.error) {
    const context = (result.error as { context?: unknown }).context;
    if (context instanceof Response) {
      const word = await context
        .json()
        .then((j: unknown) =>
          j && typeof j === 'object' ? (j as { error?: unknown }).error : undefined,
        )
        .catch(() => undefined);
      if (typeof word === 'string')
        throw new BackendError(WEB_RSVP_ERRORS[word] ?? 'unknown', word);
      if (context.status === 429) throw new BackendError('rate_limited');
    }
    const message = (result.error as { message?: unknown }).message;
    throw toBackendError({
      message: typeof message === 'string' ? message : 'failed to fetch',
    });
  }
  const data = result.data;
  const word =
    data && typeof data === 'object' ? (data as { error?: unknown }).error : undefined;
  if (typeof word === 'string')
    throw new BackendError(WEB_RSVP_ERRORS[word] ?? 'unknown', word);
  return data;
}

/** The web-rsvp function's error words, as the app names them. */
const WEB_RSVP_ERRORS: Record<string, BackendErrorCode> = {
  invalid_email: 'invalid_input',
  invalid_name: 'invalid_input',
  invalid_input: 'invalid_input',
  age_required: 'age_required',
  rate_limited: 'rate_limited',
  not_found: 'not_found',
  plan_ended: 'plan_ended',
  host: 'invalid_input',
  suspended: 'suspended',
  server: 'unknown',
};

const toQueueRow = (row: z.infer<typeof staffQueueRowSchema>): StaffQueueRow => ({
  id: row.id,
  caseRef: row.case_ref,
  targetType: row.target_type,
  targetId: row.target_id,
  targetLabel: row.target_label,
  category: row.category,
  severity: row.severity,
  status: row.status,
  slaDueAt: row.sla_due_at,
  createdAt: row.created_at,
});

const toProfile = (row: z.infer<typeof profileRowSchema>): Profile => ({
  displayName: row.display_name,
  cityId: row.city_id,
  goals: row.goals,
  peopleVisible: row.people_visible,
  status: row.status,
  suspendedUntil: row.suspended_until,
  messagesFrozenUntil: row.messages_frozen_until,
  role: row.role,
});

const myRsvpSchema = z.object({
  status: z.string(),
  offer_expires_at: z.string().nullable(),
  waitlist_position: z.number().int().nullable(),
});

function toRsvpState(status: string | undefined): RsvpState {
  // A checked-in guest is still going as far as the Plan screen is concerned.
  if (status === 'checked_in') return 'going';
  return status === 'going' || status === 'waitlisted' || status === 'offered'
    ? status
    : 'none';
}

const LIST_LIMIT = 20;
/**
 * Circles returned at once, alphabetical. Search runs on the server, so a Circle past this cap is
 * still found by searching. Paging the full list is a backlog item.
 */
const CIRCLE_LIMIT = 200;
const RECIPE_LIMIT = 100;
/** Explore searches what it loaded, so it loads a bigger (still bounded) window. */
const UPCOMING_LIMIT = 100;
/** Plans shown in listings: cancelled and completed ones are only reached by their link. */
const LISTED_STATUSES = ['published', 'changed', 'on_hold'];
/** Own RSVPs read before the date filter; bounds the query for very active members. */
const MY_PLANS_CANDIDATES = 100;
/** Past Plans older than this are not listed (the list is for recent history). */
const PAST_PLANS_DAYS = 90;
const DAY_MS = 86_400_000;

const myPlanRowSchema = z.object({
  plan_id: z.string(),
  status: z.string(),
  offer_expires_at: z.string().nullable(),
  waitlist_position: z.number().int().nullable(),
});

export function createSupabaseBackend(url: string, anonKey: string): Backend {
  const client = createClient(url, anonKey, {
    auth: {
      flowType: 'pkce',
      storage: sessionStorage,
      persistSession: true,
      autoRefreshToken: true,
      // There is no browser URL to read in a native app; the OAuth code is handled below.
      detectSessionInUrl: false,
    },
  });
  // On the web, the magic link a guest gets from a shared-link RSVP lands here with its tokens.
  if (
    Platform.OS === 'web' &&
    typeof globalThis.location !== 'undefined' &&
    globalThis.location.hash.includes('access_token=')
  ) {
    const params = new URLSearchParams(globalThis.location.hash.slice(1));
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    if (accessToken && refreshToken) {
      void client.auth
        .setSession({ access_token: accessToken, refresh_token: refreshToken })
        .then(() => {
          globalThis.history.replaceState(
            null,
            '',
            globalThis.location.pathname + globalThis.location.search,
          );
        });
    }
  }

  // Only refresh tokens while the app is in the foreground.
  AppState.addEventListener('change', (state) => {
    if (state === 'active') void client.auth.startAutoRefresh();
    else void client.auth.stopAutoRefresh();
  });

  async function requireUserId(): Promise<string> {
    const { data } = await client.auth.getSession();
    if (!data.session) throw new BackendError('not_authenticated');
    return data.session.user.id;
  }

  async function rpc(name: string, args: Record<string, string | boolean>): Promise<void> {
    const { error } = await client.rpc(name, args);
    if (error) throw toBackendError(error);
  }

  return {
    kind: 'supabase',

    async getSession() {
      const { data, error } = await client.auth.getSession();
      if (error) throw toBackendError(error);
      return toSession(data.session);
    },

    onSessionChange(listener) {
      const { data } = client.auth.onAuthStateChange((_event, session) => {
        listener(toSession(session));
      });
      return () => {
        data.subscription.unsubscribe();
      };
    },

    async signInWithOAuth(provider) {
      // System browser sheet → provider → deep link back with a one-time code.
      const redirectTo = Linking.createURL('auth/callback');
      const { data, error } = await client.auth.signInWithOAuth({
        provider,
        options: { redirectTo, skipBrowserRedirect: true },
      });
      if (error) throw toBackendError(error);

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (result.type !== 'success') throw new BackendError('cancelled');
      const code = Linking.parse(result.url).queryParams?.code;
      if (typeof code !== 'string') {
        throw new BackendError('unknown', 'Sign-in returned without a code');
      }
      const exchange = await client.auth.exchangeCodeForSession(code);
      if (exchange.error) throw toBackendError(exchange.error);
    },

    async requestEmailCode(email) {
      const { error } = await client.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: true },
      });
      if (error) throw toBackendError(error);
    },

    async verifyEmailCode(email, code) {
      const { error } = await client.auth.verifyOtp({ email, token: code, type: 'email' });
      if (!error) return;
      const mapped = toBackendError(error);
      // Wrong and expired codes both come back as 4xx auth errors.
      throw mapped.code === 'unknown'
        ? new BackendError('invalid_code', error.message)
        : mapped;
    },

    async signOut() {
      const { error } = await client.auth.signOut();
      if (error) throw toBackendError(error);
    },

    async getProfile() {
      const userId = await requireUserId();
      const { data, error } = await client
        .from('profiles')
        .select(PROFILE_COLUMNS)
        .eq('id', userId)
        .maybeSingle();
      if (error) throw toBackendError(error);
      return data ? toProfile(parse(profileRowSchema, data)) : null;
    },

    async createProfile(input) {
      const userId = await requireUserId();
      const { data, error } = await client
        .from('profiles')
        .insert({
          id: userId,
          display_name: input.displayName,
          city_id: input.cityId,
          goals: input.goals,
        })
        .select(PROFILE_COLUMNS)
        .single();
      if (error) throw toBackendError(error);

      // The sign-up screens state what is being accepted; record which version.
      const acceptance = await client.from('policy_acceptances').insert(
        (['terms', 'community_rules', 'privacy'] as const).map((policy) => ({
          user_id: userId,
          policy,
          version: input.termsVersion,
        })),
      );
      if (acceptance.error) throw toBackendError(acceptance.error);
      return toProfile(parse(profileRowSchema, data));
    },

    async updateProfile(input) {
      const userId = await requireUserId();
      const displayName = input.displayName.trim();
      const goals = input.goals.filter((g): g is (typeof PROFILE_GOALS)[number] =>
        (PROFILE_GOALS as readonly string[]).includes(g),
      );
      if (Array.from(displayName).length < 1 || Array.from(displayName).length > 40)
        throw new BackendError('invalid_input');
      const { data, error } = await client
        .from('profiles')
        .update({ display_name: displayName, goals })
        .eq('id', userId)
        .select(PROFILE_COLUMNS)
        .single();
      if (error) throw toBackendError(error);
      return toProfile(parse(profileRowSchema, data));
    },

    async getProfileStats() {
      const result = await client.rpc('profile_stats');
      if (result.error) throw toBackendError(result.error);
      return parse(profileStatsSchema, result.data);
    },

    async getHostLevel() {
      const result = await client.rpc('host_level');
      if (result.error) throw toBackendError(result.error);
      return toHostLevel(parse(hostLevelSchema, result.data));
    },

    async setFollow(userId, on) {
      const result = await client.rpc('follow_set', { p_user_id: userId, p_on: on });
      if (result.error) throw toBackendError(result.error);
      return parse(
        z.object({ following: z.boolean(), followers: z.number().int() }),
        result.data,
      );
    },

    async setRecipeVote(recipeId, on) {
      const result = await client.rpc('recipe_vote_set', { p_recipe_id: recipeId, p_on: on });
      if (result.error) throw toBackendError(result.error);
      return parse(z.object({ voted: z.boolean(), votes: z.number().int() }), result.data);
    },

    async setCity(cityId) {
      const userId = await requireUserId();
      // Only city_id is granted to members for update; RLS limits it to their own row.
      // Exactly one row must change; zero rows means the profile is missing, not a success.
      const { data, error } = await client
        .from('profiles')
        .update({ city_id: cityId })
        .eq('id', userId)
        .select('id');
      if (error) throw toBackendError(error);
      if (data.length !== 1) throw new BackendError('not_found');
    },

    async listCircles({ search }) {
      // Search runs on the server, so a Circle past the list cap is still found.
      const base = client.from('circle_cards').select('*');
      const filtered = search.trim()
        ? base.ilike('search_text', containsPattern(search))
        : base;
      const { data, error } = await filtered.order('name').limit(CIRCLE_LIMIT);
      if (error) throw toBackendError(error);
      return parse(z.array(circleCardSchema), data).map(toCircle);
    },

    async listMyCircles() {
      const { data, error } = await client
        .from('circle_cards')
        .select('*')
        .not('viewer_role', 'is', null)
        .order('name')
        .limit(CIRCLE_LIMIT);
      if (error) throw toBackendError(error);
      return parse(z.array(circleCardSchema), data).map(toCircle);
    },

    async getCircle(circleId) {
      const response: { data: unknown; error: ErrorLike | null } = await client
        .from('circle_cards')
        .select('*')
        .eq('id', circleId)
        .maybeSingle();
      if (response.error) throw toBackendError(response.error);
      if (!response.data) throw new BackendError('not_found');
      return toCircle(parse(circleCardSchema, response.data));
    },

    async joinCircle(circleId, answer, key) {
      const result = await client.rpc('circle_join', {
        p_circle_id: circleId,
        p_answer: answer,
        p_idempotency_key: key,
      });
      if (result.error) throw toBackendError(result.error);
      return parse(z.object({ status: z.enum(['member', 'requested']) }), result.data).status;
    },

    async createCircle(input, key) {
      const result = await client.rpc('circle_create', {
        p_name: input.name,
        p_tagline: input.tagline,
        p_city_id: input.cityId,
        p_is_global: false,
        p_access: input.access,
        p_join_question: input.joinQuestion,
        p_idempotency_key: key,
      });
      if (result.error) throw toBackendError(result.error);
      return parse(z.object({ id: z.string() }), result.data).id;
    },

    async getCircleRequests(circleId) {
      const result = await client.rpc('circle_pending_requests', { p_circle_id: circleId });
      if (result.error) throw toBackendError(result.error);
      return parse(z.array(circleRequestSchema), result.data).map(toCircleRequest);
    },

    async respondToCircleRequest(requestId, approve, key) {
      const result = await client.rpc('circle_request_respond', {
        p_request_id: requestId,
        p_approve: approve,
        p_idempotency_key: key,
      });
      if (result.error) throw toBackendError(result.error);
    },

    async listPeople() {
      const result = await client.rpc('people_in_my_circles');
      if (result.error) throw toBackendError(result.error);
      return parse(z.array(personRowSchema), result.data).map(toPerson);
    },

    async connectWithPerson(userId, key) {
      const result = await client.rpc('person_connect', {
        p_user_id: userId,
        p_idempotency_key: key,
      });
      if (result.error) throw toBackendError(result.error);
      return parse(z.object({ status: z.enum(['requested', 'connected']) }), result.data)
        .status;
    },

    async setPeopleVisible(visible) {
      const userId = await requireUserId();
      // Only people_visible is granted for update; exactly one row must change.
      const { data, error } = await client
        .from('profiles')
        .update({ people_visible: visible })
        .eq('id', userId)
        .select('id');
      if (error) throw toBackendError(error);
      if (data.length !== 1) throw new BackendError('not_found');
    },

    async listRecipes({ search }) {
      const base = client.from('recipe_cards').select('*');
      const filtered = search.trim()
        ? base.ilike('search_text', containsPattern(search))
        : base;
      const { data, error } = await filtered
        .order('created_at', { ascending: false })
        .limit(RECIPE_LIMIT);
      if (error) throw toBackendError(error);
      return parse(z.array(recipeCardSchema), data).map(toRecipe);
    },

    async getRecipe(recipeId) {
      const card: { data: unknown; error: ErrorLike | null } = await client
        .from('recipe_cards')
        .select('*')
        .eq('id', recipeId)
        .maybeSingle();
      if (card.error) throw toBackendError(card.error);
      if (!card.data) throw new BackendError('not_found');
      const ingredients: { data: unknown; error: ErrorLike | null } = await client
        .from('recipe_ingredients')
        .select('name, qty, unit')
        .eq('recipe_id', recipeId)
        .order('position');
      if (ingredients.error) throw toBackendError(ingredients.error);
      const steps: { data: unknown; error: ErrorLike | null } = await client
        .from('recipe_steps')
        .select('body')
        .eq('recipe_id', recipeId)
        .order('position');
      if (steps.error) throw toBackendError(steps.error);
      return {
        ...toRecipe(parse(recipeCardSchema, card.data)),
        ingredients: parse(z.array(recipeIngredientSchema), ingredients.data),
        steps: parse(z.array(z.object({ body: z.string() })), steps.data).map((s) => s.body),
      };
    },

    async createRecipe(input, key) {
      const result = await client.rpc('recipe_create', {
        p_circle_id: input.circleId,
        p_title: input.title,
        p_cuisine: input.cuisine,
        p_serves: input.serves,
        p_minutes: input.minutes,
        p_intro: input.intro,
        p_allergens: input.allergensConfirmed ? input.allergens : [],
        p_allergens_confirmed: input.allergensConfirmed,
        p_ingredients: input.ingredients,
        p_steps: input.steps,
        p_idempotency_key: key,
      });
      if (result.error) throw toBackendError(result.error);
      return parse(z.object({ id: z.string() }), result.data).id;
    },

    async createPlan(input, key) {
      const result = await client.rpc('plan_create', {
        p_kind: input.category,
        p_format: input.format,
        p_title: input.title,
        p_description: input.description,
        p_starts_at: input.startsAt,
        p_ends_at: input.endsAt,
        p_capacity: input.capacity,
        p_allergens: input.allergens,
        p_area_label: input.areaName,
        p_address: input.address,
        p_keep_address_private: input.keepAddressPrivate,
        p_meeting_url: input.meetingUrl,
        p_idempotency_key: key,
      });
      if (result.error) throw toBackendError(result.error);
      return parse(z.object({ id: z.string() }), result.data).id;
    },

    async listGuests(planId) {
      const result = await client.rpc('host_guest_list', { p_plan_id: planId });
      if (result.error) throw toBackendError(result.error);
      return parse(z.array(guestRowSchema), result.data).map(toGuest);
    },

    async getHostSummary(planId) {
      const result = await client.rpc('host_plan_summary', { p_plan_id: planId });
      if (result.error) throw toBackendError(result.error);
      const summary = parse(
        z.object({
          going: z.number(),
          checked_in: z.number(),
          no_show: z.number(),
          ended: z.boolean(),
          live: z.boolean(),
          feedback_count: z.number(),
          average_rating: z.number().nullable(),
        }),
        result.data,
      );
      return {
        going: summary.going,
        checkedIn: summary.checked_in,
        noShow: summary.no_show,
        ended: summary.ended,
        live: summary.live,
        feedbackCount: summary.feedback_count,
        averageRating: summary.average_rating,
      };
    },

    async checkInGuest(planId, userId, checkedIn, key) {
      const result = await client.rpc('host_check_in', {
        p_plan_id: planId,
        p_user_id: userId,
        p_checked_in: checkedIn,
        p_idempotency_key: key,
      });
      if (result.error) throw toBackendError(result.error);
      return parse(z.object({ state: z.enum(['going', 'checked_in']) }), result.data).state;
    },

    async endPlan(planId, key) {
      const result = await client.rpc('host_end_plan', {
        p_plan_id: planId,
        p_idempotency_key: key,
      });
      if (result.error) throw toBackendError(result.error);
    },

    async getFeedback(planId) {
      const result = await client.rpc('plan_feedback_mine', { p_plan_id: planId });
      if (result.error) throw toBackendError(result.error);
      const row = parse(
        z.object({
          eligible: z.boolean(),
          rating: z.number().nullable(),
          comment: z.string().nullable(),
        }),
        result.data,
      );
      return row;
    },

    async submitFeedback(planId, rating, comment, key) {
      const result = await client.rpc('plan_feedback_submit', {
        p_plan_id: planId,
        p_rating: rating,
        p_comment: comment,
        p_idempotency_key: key,
      });
      if (result.error) throw toBackendError(result.error);
    },

    async openConversation(kind, refId) {
      const result = await client.rpc('conversation_open', { p_kind: kind, p_ref: refId });
      if (result.error) throw toBackendError(result.error);
      return parse(z.string(), result.data);
    },

    async listMessages(conversationId) {
      // The newest 100, shown oldest first.
      const { data, error } = await client
        .from('message_cards')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw toBackendError(error);
      return parse(z.array(messageCardSchema), data).map(toChatMessage).reverse();
    },

    async sendMessage(conversationId, body, clientId) {
      const result = await client.rpc('message_post', {
        p_conversation_id: conversationId,
        p_body: body,
        p_client_id: clientId,
      });
      if (result.error) throw toBackendError(result.error);
    },

    async requestDirect(userId, firstMessage, clientId) {
      const result = await client.rpc('dm_request', {
        p_to: userId,
        p_first_message: firstMessage,
        p_client_id: clientId,
      });
      if (result.error) throw toBackendError(result.error);
      return parse(
        z.object({
          status: z.enum(['pending', 'accepted', 'declined']),
          conversation_id: z.string().optional(),
        }),
        result.data,
      );
    },

    async listDirectRequests() {
      const { data, error } = await client
        .from('message_request_cards')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw toBackendError(error);
      return parse(z.array(messageRequestCardSchema), data).map(toDirectRequest);
    },

    async respondDirectRequest(requestId, accept) {
      const result = await client.rpc('dm_request_respond', {
        p_request_id: requestId,
        p_accept: accept,
      });
      if (result.error) throw toBackendError(result.error);
      return parse(z.object({ status: z.enum(['accepted', 'declined']) }), result.data).status;
    },

    async getConversationSettings(conversationId) {
      const userId = await requireUserId();
      const response: { data: unknown; error: ErrorLike | null } = await client
        .from('conversation_settings')
        .select('muted_until, pinned_at')
        .eq('conversation_id', conversationId)
        .eq('user_id', userId)
        .maybeSingle();
      if (response.error) throw toBackendError(response.error);
      const row = parse(settingsRowSchema.nullable(), response.data);
      return {
        mutedUntil: row?.muted_until ?? null,
        pinned: Boolean(row?.pinned_at),
      };
    },

    async setMutedUntil(conversationId, until) {
      const result = await client.rpc('conversation_mute', {
        p_conversation_id: conversationId,
        p_until: until,
      });
      if (result.error) throw toBackendError(result.error);
    },

    async setPinned(conversationId, pinned) {
      const result = await client.rpc('conversation_pin', {
        p_conversation_id: conversationId,
        p_pinned: pinned,
      });
      if (result.error) throw toBackendError(result.error);
    },

    async listInbox() {
      const result = await client.rpc('inbox_threads');
      if (result.error) throw toBackendError(result.error);
      return parse(z.array(inboxRowSchema), result.data).map(toInboxThread);
    },

    async markConversationRead(conversationId, upTo) {
      const result = await client.rpc('conversation_mark_read', {
        p_conversation_id: conversationId,
        p_up_to: upTo,
      });
      if (result.error) throw toBackendError(result.error);
    },

    async getOrder(planId) {
      const { data: sessionData } = await client.auth.getSession();
      const userId = sessionData.session?.user.id ?? null;
      const [card, items] = await Promise.all([
        client.from('order_cards').select('*').eq('plan_id', planId).maybeSingle(),
        client.from('order_item_cards').select('*').eq('plan_id', planId).order('position'),
      ]);
      if (card.error) throw toBackendError(card.error);
      if (items.error) throw toBackendError(items.error);
      if (!card.data) throw new BackendError('not_found');
      const order = parse(orderCardSchema, card.data);
      const rows = parse(z.array(orderItemCardSchema), items.data);
      let mine = new Map<string, { quantity: number; collected: boolean }>();
      let pickupAddress: string | null = null;
      if (userId) {
        const [interests, address] = await Promise.all([
          client
            .from('order_interests')
            .select('item_id, quantity, collected_at')
            .in(
              'item_id',
              rows.map((r) => r.id),
            ),
          client.rpc('order_pickup_address', { p_plan_id: planId }),
        ]);
        if (interests.error) throw toBackendError(interests.error);
        if (address.error) throw toBackendError(address.error);
        mine = new Map(
          parse(
            z.array(
              z.object({
                item_id: z.string(),
                quantity: z.coerce.number(),
                collected_at: z.string().nullable(),
              }),
            ),
            interests.data,
          ).map((i) => [
            i.item_id,
            { quantity: i.quantity, collected: i.collected_at !== null },
          ]),
        );
        pickupAddress = parse(z.string().nullable(), address.data);
      }
      return {
        id: order.plan_id,
        title: order.title,
        description: order.description,
        organizerId: order.organizer_id,
        organizerName: order.organizer_name,
        supplierName: order.supplier_name,
        supplierArea: order.supplier_area,
        closesAt: order.closes_at,
        pickupStart: order.pickup_start,
        pickupEnd: order.pickup_end,
        pickupNote: order.pickup_note,
        timezone: order.tz,
        pickupAddress,
        state: order.state,
        extendedOnce: order.extended_once,
        targetTotal: order.target_total,
        interestTotal: order.interest_total,
        peopleCount: order.people_count,
        items: rows.map((r) => ({
          id: r.id,
          name: r.name,
          unit: r.unit,
          target: r.target,
          estPriceMinor: r.est_price_minor,
          currency: r.currency,
          interestTotal: r.interest_total,
          mine: mine.get(r.id)?.quantity ?? 0,
        })),
        collected:
          [...mine.values()].some((m) => m.quantity > 0) &&
          [...mine.values()].every((m) => m.quantity === 0 || m.collected),
      };
    },

    async webRsvp(planId, input, key) {
      const data = await invokeFunction(client, 'web-rsvp', {
        action: 'join',
        plan_id: planId,
        first_name: input.firstName,
        email: input.email,
        age_confirmed: input.ageConfirmed,
        idempotency_key: key,
      });
      const parsed = parse(
        z.object({
          status: z.enum(['going', 'waitlisted', 'offered', 'existing']),
          position: z.number().int().nullable().optional(),
          cancel_token: z.string().nullable().optional(),
          email_sent: z.boolean().optional(),
        }),
        data,
      );
      return {
        status: parsed.status,
        position: parsed.position ?? null,
        cancelToken: parsed.cancel_token ?? null,
        emailSent: parsed.email_sent ?? false,
      };
    },

    async webRsvpCancel(cancelToken, key) {
      await invokeFunction(client, 'web-rsvp', {
        action: 'cancel',
        token: cancelToken,
        idempotency_key: key,
      });
    },

    async listNotifications() {
      const result = await client.rpc('notifications_list', { p_limit: 100 });
      if (result.error) throw toBackendError(result.error);
      return parse(z.array(notificationRowSchema), result.data).map(toNotification);
    },

    async markNotificationRead(id) {
      const result = await client.rpc('notification_mark_read', { p_id: id });
      if (result.error) throw toBackendError(result.error);
    },

    async markAllNotificationsRead() {
      const result = await client.rpc('notifications_mark_all_read');
      if (result.error) throw toBackendError(result.error);
    },

    async registerPushToken(token, platform) {
      const result = await client.rpc('push_token_register', {
        p_token: token,
        p_platform: platform,
      });
      if (result.error) throw toBackendError(result.error);
    },

    async removePushToken(token) {
      const result = await client.rpc('push_token_remove', { p_token: token });
      if (result.error) throw toBackendError(result.error);
    },

    async getPendingPolicies() {
      const result = await client.rpc('policies_pending');
      if (result.error) throw toBackendError(result.error);
      return parse(z.array(pendingPolicySchema), result.data).map(toPendingPolicy);
    },

    async acceptPolicies(versions) {
      const result = await client.rpc('policies_accept', { p_versions: versions });
      if (result.error) throw toBackendError(result.error);
      return parse(z.number().int(), result.data);
    },

    async getSettings() {
      const result = await client.rpc('settings_get');
      if (result.error) throw toBackendError(result.error);
      return toSettings(parse(settingsSchema, result.data));
    },

    async updateSettings(patch) {
      const result = await client.rpc('settings_update', {
        p_patch: settingsPatchToRow(patch),
      });
      if (result.error) throw toBackendError(result.error);
      return toSettings(parse(settingsSchema, result.data));
    },

    async requestDataExport(key) {
      const result = await client.rpc('data_export_request', { p_idempotency_key: key });
      if (result.error) throw toBackendError(result.error);
      return parse(z.object({ requested_at: z.string() }), result.data).requested_at;
    },

    async deleteAccount(key) {
      const result = await client.rpc('account_delete', { p_idempotency_key: key });
      if (result.error) throw toBackendError(result.error);
      // The stub cannot act as this person again; the device forgets the session even offline.
      await client.auth.signOut({ scope: 'local' });
    },

    async blockUser(userId, key) {
      const result = await client.rpc('block_user', {
        p_user_id: userId,
        p_idempotency_key: key,
      });
      if (result.error) throw toBackendError(result.error);
    },

    async unblockUser(userId) {
      const result = await client.rpc('unblock_user', { p_user_id: userId });
      if (result.error) throw toBackendError(result.error);
    },

    async listBlocked() {
      const result = await client.rpc('my_blocks');
      if (result.error) throw toBackendError(result.error);
      return parse(
        z.array(
          z.object({ user_id: z.string(), display_name: z.string(), created_at: z.string() }),
        ),
        result.data,
      ).map((r) => ({
        userId: r.user_id,
        displayName: r.display_name,
        createdAt: r.created_at,
      }));
    },

    async createReport(input, key) {
      const result = await client.rpc('report_create', {
        p_target_type: input.targetType,
        p_target_id: input.targetId,
        p_category: input.category,
        p_details: input.details,
        p_accuracy_confirmed: input.accuracyConfirmed,
        p_idempotency_key: key,
      });
      if (result.error) throw toBackendError(result.error);
      const row = parse(
        z.object({ case_ref: z.string(), severity: z.enum(['urgent', 'high', 'routine']) }),
        result.data,
      );
      return { caseRef: row.case_ref, severity: row.severity };
    },

    async getSuspension() {
      const result = await client.rpc('my_suspension');
      if (result.error) throw toBackendError(result.error);
      if (result.data === null) return null;
      const row = parse(suspensionSchema, result.data);
      return {
        actionId: row.action_id,
        action: row.action,
        reason: row.reason,
        rule: row.rule,
        until: row.until,
        automated: row.automated,
        decidedAt: row.decided_at,
        appealStatus: row.appeal_status,
      };
    },

    async createAppeal(actionId, statement, key) {
      const result = await client.rpc('appeal_create', {
        p_action_id: actionId,
        p_statement: statement,
        p_idempotency_key: key,
      });
      if (result.error) throw toBackendError(result.error);
    },

    async staffQueue() {
      const result = await client.rpc('staff_queue');
      if (result.error) throw toBackendError(result.error);
      return parse(z.array(staffQueueRowSchema), result.data).map(toQueueRow);
    },

    async staffCase(reportId) {
      const result = await client.rpc('staff_case', { p_report_id: reportId });
      if (result.error) throw toBackendError(result.error);
      const row = parse(staffCaseSchema, result.data);
      return {
        ...toQueueRow(row),
        details: row.details,
        targetUserName: row.target_user_name,
        evidenceCount: row.evidence_count,
        history: row.history,
        actions: row.actions.map((a) => ({
          id: a.id,
          action: a.action,
          reason: a.reason,
          until: a.until,
          createdAt: a.created_at,
        })),
        appeal: row.appeal
          ? {
              id: row.appeal.id,
              statement: row.appeal.statement,
              status: row.appeal.status,
              originalAction: row.appeal.original_action,
              originalReason: row.appeal.original_reason,
            }
          : null,
      };
    },

    async staffViewMessages(reportId, reason) {
      const result = await client.rpc('staff_view_messages', {
        p_report_id: reportId,
        p_reason: reason,
      });
      if (result.error) throw toBackendError(result.error);
      return parse(z.array(messageCardSchema), result.data).map(toChatMessage);
    },

    async staffDecide(input, key) {
      const result = await client.rpc('staff_decide', {
        p_report_id: input.reportId,
        p_action: input.action,
        p_reason: input.reason,
        p_rule: input.rule,
        p_until: input.until,
        p_idempotency_key: key,
      });
      if (result.error) throw toBackendError(result.error);
    },

    async staffAppeals() {
      const result = await client.rpc('staff_appeals');
      if (result.error) throw toBackendError(result.error);
      return parse(z.array(staffAppealSchema), result.data).map((r) => ({
        id: r.id,
        caseRef: r.case_ref,
        action: r.action,
        originalActorName: r.original_actor_name,
        originalReason: r.original_reason,
        statement: r.statement,
        memberName: r.member_name,
        createdAt: r.created_at,
      }));
    },

    async staffAppealDecide(appealId, uphold, reason, key) {
      const result = await client.rpc('staff_appeal_decide', {
        p_appeal_id: appealId,
        p_uphold: uphold,
        p_reason: reason,
        p_idempotency_key: key,
      });
      if (result.error) throw toBackendError(result.error);
    },

    async staffAudit(limit) {
      const result = await client.rpc('staff_audit', { p_limit: limit });
      if (result.error) throw toBackendError(result.error);
      return parse(z.array(auditRowSchema), result.data).map((r) => ({
        id: r.id,
        actorName: r.actor_name,
        actorRole: r.actor_role,
        action: r.action,
        targetType: r.target_type,
        reason: r.reason,
        createdAt: r.created_at,
      }));
    },

    async createOrder(input, key) {
      const result = await client.rpc('order_create', {
        p_title: input.title,
        p_description: input.description,
        p_supplier_name: input.supplierName,
        p_supplier_area: input.supplierArea,
        p_closes_at: input.closesAt,
        p_pickup_start: input.pickupStart,
        p_pickup_end: input.pickupEnd,
        p_pickup_address: input.pickupAddress,
        p_pickup_note: input.pickupNote,
        p_items: input.items.map((i) => ({
          name: i.name,
          unit: i.unit,
          target: i.target,
          est_price_minor: i.estPriceMinor,
        })),
        p_idempotency_key: key,
      });
      if (result.error) throw toBackendError(result.error);
      return parse(z.object({ id: z.string() }), result.data).id;
    },

    async setOrderInterest(itemId, quantity, key) {
      const result = await client.rpc('order_set_interest', {
        p_item_id: itemId,
        p_quantity: quantity,
        p_idempotency_key: key,
      });
      if (result.error) throw toBackendError(result.error);
    },

    async decideOrder(planId, decision, key) {
      const result = await client.rpc('order_decide', {
        p_plan_id: planId,
        p_decision: decision,
        p_idempotency_key: key,
      });
      if (result.error) throw toBackendError(result.error);
      return parse(z.object({ state: z.enum(ORDER_STATES) }), result.data).state;
    },

    async markOrderCollected(planId, key) {
      const result = await client.rpc('order_mark_collected', {
        p_plan_id: planId,
        p_idempotency_key: key,
      });
      if (result.error) throw toBackendError(result.error);
    },

    async ensureCity(input) {
      const result = await client.rpc('city_ensure', {
        p_name: input.name,
        p_country_code: input.countryCode,
        p_tz: input.timezone,
      });
      if (result.error) throw toBackendError(result.error);
      const row = parse(cityRowSchema, result.data);
      return { id: row.id, name: row.name, countryCode: row.country_code, timezone: row.tz };
    },

    async listCities() {
      // Typed-in cities grow this list; a server-side search replaces it past a thousand (open questions).
      const { data, error } = await client.from('cities').select('*').order('name').limit(1000);
      if (error) throw toBackendError(error);
      return parse(z.array(cityRowSchema), data).map((row) => ({
        id: row.id,
        name: row.name,
        countryCode: row.country_code,
        timezone: row.tz,
      }));
    },

    async listUpcomingPlans({ cityIds, from, to, format, order }) {
      if (cityIds?.length === 0) return [];
      let query = client
        .from('plan_cards')
        .select('*')
        .in('status', LISTED_STATUSES)
        .gte('ends_at', from.toISOString())
        .lt('starts_at', to.toISOString());
      if (cityIds) query = query.in('city_id', cityIds);
      if (format) query = query.eq('format', format);
      if (order === 'featured') query = query.order('host_featured', { ascending: false });
      const { data, error } = await query.order('starts_at').order('id').limit(UPCOMING_LIMIT);
      if (error) throw toBackendError(error);
      return parse(z.array(planCardSchema), data).map(toPlan);
    },

    async getPlan(planId) {
      const { data: sessionData } = await client.auth.getSession();
      const userId = sessionData.session?.user.id ?? null;

      const [card, items] = await Promise.all([
        client.from('plan_cards').select('*').eq('id', planId).maybeSingle(),
        client
          .from('contribution_slot_cards')
          .select('*')
          .eq('plan_id', planId)
          .order('position'),
      ]);
      if (card.error) throw toBackendError(card.error);
      if (items.error) throw toBackendError(items.error);
      if (!card.data) throw new BackendError('not_found');
      const itemRows = parse(z.array(bringItemCardSchema), items.data);

      let mine: z.infer<typeof myRsvpSchema> | null = null;
      let address: string | null = null;
      let meetingUrl: string | null = null;
      let myItemIds = new Set<string>();
      if (userId) {
        const [rsvp, secret, link, claims] = await Promise.all([
          client.from('my_rsvps').select('*').eq('plan_id', planId).maybeSingle(),
          // RLS returns no row unless this member is allowed to see the address.
          client.from('plan_private').select('address').eq('plan_id', planId).maybeSingle(),
          // Its own table with its own rule: empty until 10 minutes before the start.
          client
            .from('plan_meeting_links')
            .select('meeting_url')
            .eq('plan_id', planId)
            .maybeSingle(),
          client
            .from('contribution_claims')
            .select('slot_id')
            .in(
              'slot_id',
              itemRows.map((item) => item.id),
            ),
        ]);
        if (rsvp.error) throw toBackendError(rsvp.error);
        if (secret.error) throw toBackendError(secret.error);
        if (link.error) throw toBackendError(link.error);
        if (claims.error) throw toBackendError(claims.error);
        mine = parse(myRsvpSchema.nullable(), rsvp.data);
        // Online Plans have no address, so the private row's address can be null.
        address =
          parse(z.object({ address: z.string().nullable() }).nullable(), secret.data)
            ?.address ?? null;
        meetingUrl =
          parse(z.object({ meeting_url: z.string() }).nullable(), link.data)?.meeting_url ??
          null;
        myItemIds = new Set(
          parse(z.array(z.object({ slot_id: z.string() })), claims.data).map((c) => c.slot_id),
        );
      }

      return {
        plan: toPlan(parse(planCardSchema, card.data)),
        bringItems: itemRows.map((item) => ({
          id: item.id,
          label: item.label,
          quantity: item.quantity,
          claimedCount: item.claimed_count,
          claimedBy: item.claimed_by,
          claimedByMe: myItemIds.has(item.id),
        })),
        rsvp: toRsvpState(mine?.status),
        waitlistPosition: mine?.waitlist_position ?? null,
        offerExpiresAt: mine?.offer_expires_at ?? null,
        address,
        meetingUrl,
      };
    },

    async getUpNext(now) {
      const rsvps = await client
        .from('rsvps')
        .select('plan_id')
        .in('state', ['going', 'checked_in'])
        .limit(100);
      if (rsvps.error) throw toBackendError(rsvps.error);
      const planIds = parse(z.array(z.object({ plan_id: z.string() })), rsvps.data).map(
        (r) => r.plan_id,
      );
      if (planIds.length === 0) return null;

      const next = await client
        .from('plan_cards')
        .select('*')
        .in('id', planIds)
        .gte('ends_at', now.toISOString())
        .order('starts_at')
        .limit(1)
        .maybeSingle();
      if (next.error) throw toBackendError(next.error);
      if (!next.data) return null;
      const plan: Plan = toPlan(parse(planCardSchema, next.data));
      if (plan.openBringSlots === 0) return { plan, needsDish: false };

      const mine = await client
        .from('contribution_claims')
        .select('slot_id, contribution_slots!inner(plan_id)')
        .eq('contribution_slots.plan_id', plan.id)
        .limit(1);
      if (mine.error) throw toBackendError(mine.error);
      return { plan, needsDish: mine.data.length === 0 };
    },

    async listMyPlans({ scope, now }) {
      await requireUserId();
      const statuses =
        scope === 'upcoming' ? ['going', 'waitlisted', 'offered'] : ['going', 'checked_in'];
      const rsvps = await client
        .from('my_rsvps')
        .select('plan_id, status, offer_expires_at, waitlist_position')
        .in('status', statuses)
        .limit(MY_PLANS_CANDIDATES);
      if (rsvps.error) throw toBackendError(rsvps.error);
      const rows = parse(z.array(myPlanRowSchema), rsvps.data);
      if (rows.length === 0) return [];

      const byId = client
        .from('plan_cards')
        .select('*')
        .in(
          'id',
          rows.map((row) => row.plan_id),
        );
      const cards =
        scope === 'upcoming'
          ? await byId.gte('ends_at', now.toISOString())
          : await byId
              .lt('ends_at', now.toISOString())
              .gte('ends_at', new Date(now.getTime() - PAST_PLANS_DAYS * DAY_MS).toISOString());
      if (cards.error) throw toBackendError(cards.error);
      const plans = new Map(
        parse(z.array(planCardSchema), cards.data).map((card) => [card.id, toPlan(card)]),
      );

      const mine = rows.flatMap((row) => {
        const plan = plans.get(row.plan_id);
        const rsvp = toRsvpState(row.status);
        if (!plan || rsvp === 'none') return [];
        return [
          {
            plan,
            rsvp,
            waitlistPosition: row.waitlist_position,
            offerExpiresAt: row.offer_expires_at,
          },
        ];
      });
      const direction = scope === 'upcoming' ? 1 : -1;
      mine.sort(
        (a, b) =>
          direction *
          (new Date(a.plan.startsAt).getTime() - new Date(b.plan.startsAt).getTime()),
      );
      return mine.slice(0, LIST_LIMIT);
    },

    // rsvp_join takes a free spot or puts the member in line, so joinWaitlist is the same call.
    joinPlan: (planId, key) => rpc('rsvp_join', { p_plan_id: planId, p_idempotency_key: key }),
    cancelRsvp: (planId, key) =>
      rpc('rsvp_cancel', { p_plan_id: planId, p_idempotency_key: key }),
    joinWaitlist: (planId, key) =>
      rpc('rsvp_join', { p_plan_id: planId, p_idempotency_key: key }),

    async confirmWaitlistOffer(planId, key) {
      const result = await client.rpc('waitlist_respond', {
        p_plan_id: planId,
        p_accept: true,
        p_idempotency_key: key,
      });
      if (result.error) throw toBackendError(result.error);
      const outcome: unknown = result.data;
      return parse(z.object({ status: z.enum(['going', 'expired', 'waitlisted']) }), outcome)
        .status;
    },

    async getWaitlistOffers() {
      const offers = await client
        .from('my_rsvps')
        .select('plan_id, offer_expires_at')
        .eq('status', 'offered')
        .order('offer_expires_at')
        .limit(20);
      if (offers.error) throw toBackendError(offers.error);
      const rows = parse(
        z.array(z.object({ plan_id: z.string(), offer_expires_at: z.string() })),
        offers.data,
      );
      if (rows.length === 0) return [];

      const cards = await client
        .from('plan_cards')
        .select('*')
        .in(
          'id',
          rows.map((row) => row.plan_id),
        );
      if (cards.error) throw toBackendError(cards.error);
      const plans = new Map(
        parse(z.array(planCardSchema), cards.data).map((card) => [card.id, toPlan(card)]),
      );
      return rows.flatMap((row) => {
        const plan = plans.get(row.plan_id);
        return plan ? [{ plan, expiresAt: row.offer_expires_at }] : [];
      });
    },
    claimBringItem: (itemId, key) =>
      rpc('slot_claim', { p_slot_id: itemId, p_idempotency_key: key }),
    unclaimBringItem: (itemId, key) =>
      rpc('slot_unclaim', { p_slot_id: itemId, p_idempotency_key: key }),
    addBringItem: async (planId, item, key) => {
      const result = await client.rpc('host_bring_add', {
        p_plan_id: planId,
        p_label: item.label,
        p_quantity: item.quantity,
        p_idempotency_key: key,
      });
      if (result.error) throw toBackendError(result.error);
      return parse(z.object({ id: z.string() }), result.data).id;
    },
    updateBringItem: async (itemId, item, key) => {
      const result = await client.rpc('host_bring_update', {
        p_item_id: itemId,
        p_label: item.label,
        p_quantity: item.quantity,
        p_idempotency_key: key,
      });
      if (result.error) throw toBackendError(result.error);
    },
    removeBringItem: async (itemId, key) => {
      const result = await client.rpc('host_bring_remove', {
        p_item_id: itemId,
        p_idempotency_key: key,
      });
      if (result.error) throw toBackendError(result.error);
    },
  };
}

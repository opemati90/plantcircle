import { createClient, type Session as SupabaseSession } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { AppState } from 'react-native';
import { z } from 'zod';
import { sessionStorage } from '../../storage';
import { BackendError, type Backend } from '../backend';
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
  personRowSchema,
  recipeCardSchema,
  toGuest,
  recipeIngredientSchema,
  toPerson,
  toRecipe,
  planCardSchema,
  toPlan,
  type Plan,
  type Profile,
  type RsvpState,
  type Session,
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
});
const PROFILE_COLUMNS = 'display_name, city_id, goals, people_visible';

const toProfile = (row: z.infer<typeof profileRowSchema>): Profile => ({
  displayName: row.display_name,
  cityId: row.city_id,
  goals: row.goals,
  peopleVisible: row.people_visible,
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
      const filtered = search.trim() ? base.ilike('search_text', containsPattern(search)) : base;
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
      const result = await client.rpc('person_connect', { p_user_id: userId, p_idempotency_key: key });
      if (result.error) throw toBackendError(result.error);
      return parse(z.object({ status: z.enum(['requested', 'connected']) }), result.data).status;
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
      const filtered = search.trim() ? base.ilike('search_text', containsPattern(search)) : base;
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
      const result = await client.rpc('host_end_plan', { p_plan_id: planId, p_idempotency_key: key });
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

    async listCities() {
      const { data, error } = await client.from('cities').select('*').order('name').limit(200);
      if (error) throw toBackendError(error);
      return parse(z.array(cityRowSchema), data).map((row) => ({
        id: row.id,
        name: row.name,
        countryCode: row.country_code,
        timezone: row.tz,
      }));
    },

    async listUpcomingPlans({ cityIds, from, to }) {
      if (cityIds?.length === 0) return [];
      let query = client
        .from('plan_cards')
        .select('*')
        .in('status', LISTED_STATUSES)
        .gte('ends_at', from.toISOString())
        .lt('starts_at', to.toISOString());
      if (cityIds) query = query.in('city_id', cityIds);
      const { data, error } = await query.order('starts_at').limit(UPCOMING_LIMIT);
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

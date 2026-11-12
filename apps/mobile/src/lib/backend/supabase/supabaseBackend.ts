import { createClient, type Session as SupabaseSession } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { AppState } from 'react-native';
import { z } from 'zod';
import { sessionStorage } from '../../storage';
import { BackendError, type Backend } from '../backend';
import { toBackendError } from './errors';
import {
  bringItemCardSchema,
  cityRowSchema,
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
});
const PROFILE_COLUMNS = 'display_name, city_id, goals';

const toProfile = (row: z.infer<typeof profileRowSchema>): Profile => ({
  displayName: row.display_name,
  cityId: row.city_id,
  goals: row.goals,
});

const myRsvpSchema = z.object({
  status: z.string(),
  offer_expires_at: z.string().nullable(),
  waitlist_position: z.number().int().nullable(),
});

function toRsvpState(status: string | undefined): RsvpState {
  return status === 'going' || status === 'waitlisted' || status === 'offered'
    ? status
    : 'none';
}

const LIST_LIMIT = 20;

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

  async function rpc(name: string, args: Record<string, string>): Promise<void> {
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

    async listCities() {
      const { data, error } = await client.from('cities').select('*').order('name').limit(200);
      if (error) throw toBackendError(error);
      return parse(z.array(cityRowSchema), data).map((row) => ({
        id: row.id,
        name: row.name,
        countryCode: row.country_code,
        timezone: row.timezone,
      }));
    },

    async listUpcomingPlans({ cityId, from, to }) {
      let query = client
        .from('plan_cards')
        .select('*')
        .gte('ends_at', from.toISOString())
        .lt('starts_at', to.toISOString());
      if (cityId) query = query.eq('city_id', cityId);
      const { data, error } = await query.order('starts_at').limit(LIST_LIMIT);
      if (error) throw toBackendError(error);
      return parse(z.array(planCardSchema), data).map(toPlan);
    },

    async getPlan(planId) {
      const { data: sessionData } = await client.auth.getSession();
      const userId = sessionData.session?.user.id ?? null;

      const [card, items] = await Promise.all([
        client.from('plan_cards').select('*').eq('id', planId).maybeSingle(),
        client.from('bring_item_cards').select('*').eq('plan_id', planId).order('position'),
      ]);
      if (card.error) throw toBackendError(card.error);
      if (items.error) throw toBackendError(items.error);
      if (!card.data) throw new BackendError('not_found');
      const itemRows = parse(z.array(bringItemCardSchema), items.data);

      let mine: z.infer<typeof myRsvpSchema> | null = null;
      let address: string | null = null;
      let myItemIds = new Set<string>();
      if (userId) {
        const [rsvp, secret, claims] = await Promise.all([
          client.from('my_rsvps').select('*').eq('plan_id', planId).maybeSingle(),
          // RLS returns no row unless this member is allowed to see the address.
          client.from('plan_private').select('address').eq('plan_id', planId).maybeSingle(),
          client
            .from('bring_claims')
            .select('item_id')
            .in(
              'item_id',
              itemRows.map((item) => item.id),
            ),
        ]);
        if (rsvp.error) throw toBackendError(rsvp.error);
        if (secret.error) throw toBackendError(secret.error);
        if (claims.error) throw toBackendError(claims.error);
        mine = parse(myRsvpSchema.nullable(), rsvp.data);
        address =
          parse(z.object({ address: z.string() }).nullable(), secret.data)?.address ?? null;
        myItemIds = new Set(
          parse(z.array(z.object({ item_id: z.string() })), claims.data).map((c) => c.item_id),
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
      };
    },

    async getUpNext(now) {
      const rsvps = await client
        .from('rsvps')
        .select('plan_id')
        .eq('status', 'going')
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
        .from('bring_claims')
        .select('item_id, bring_items!inner(plan_id)')
        .eq('bring_items.plan_id', plan.id)
        .limit(1);
      if (mine.error) throw toBackendError(mine.error);
      return { plan, needsDish: mine.data.length === 0 };
    },

    joinPlan: (planId, key) => rpc('join_plan', { p_plan_id: planId, p_idempotency_key: key }),
    cancelRsvp: (planId, key) =>
      rpc('cancel_rsvp', { p_plan_id: planId, p_idempotency_key: key }),
    joinWaitlist: (planId, key) =>
      rpc('join_waitlist', { p_plan_id: planId, p_idempotency_key: key }),

    async confirmWaitlistOffer(planId, key) {
      const result = await client.rpc('confirm_waitlist_offer', {
        p_plan_id: planId,
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
      rpc('claim_bring_item', { p_item_id: itemId, p_idempotency_key: key }),
  };
}

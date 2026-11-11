import { createClient, type Session as SupabaseSession } from '@supabase/supabase-js';
import { z } from 'zod';
import { BackendError, type Backend, type BackendErrorCode } from '../backend';
import {
  bringItemCardSchema,
  planCardSchema,
  toPlan,
  type Plan,
  type Profile,
  type Session,
} from '../types';

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
  city: z.string(),
  goals: z.array(z.string()),
});

const toProfile = (row: z.infer<typeof profileRowSchema>): Profile => ({
  displayName: row.display_name,
  city: row.city,
  goals: row.goals,
});

const LIST_LIMIT = 20;

export function createSupabaseBackend(url: string, anonKey: string): Backend {
  const client = createClient(url, anonKey, {
    auth: { flowType: 'pkce', persistSession: true, detectSessionInUrl: true },
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

    async signInWithOAuth(provider, returnTo) {
      const { error } = await client.auth.signInWithOAuth({
        provider,
        options: { redirectTo: returnTo },
      });
      if (error) throw toBackendError(error);
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
        .select('display_name, city, goals')
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
          city: input.city,
          goals: input.goals,
          terms_version: input.termsVersion,
        })
        .select('display_name, city, goals')
        .single();
      if (error) throw toBackendError(error);
      return toProfile(parse(profileRowSchema, data));
    },

    async listUpcomingPlans({ city, from, to }) {
      const { data, error } = await client
        .from('plan_cards')
        .select('*')
        .eq('city', city)
        .gte('ends_at', from.toISOString())
        .lt('starts_at', to.toISOString())
        .order('starts_at')
        .limit(LIST_LIMIT);
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

      let isGoing = false;
      let address: string | null = null;
      let myItemIds = new Set<string>();
      if (userId) {
        const [rsvp, secret, claims] = await Promise.all([
          client.from('rsvps').select('status').eq('plan_id', planId).maybeSingle(),
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
        isGoing =
          parse(z.object({ status: z.string() }).nullable(), rsvp.data)?.status === 'going';
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
        isGoing,
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

    joinPlan: (planId) => rpc('join_plan', { p_plan_id: planId }),
    cancelRsvp: (planId) => rpc('cancel_rsvp', { p_plan_id: planId }),
    claimBringItem: (itemId) => rpc('claim_bring_item', { p_item_id: itemId }),
  };
}

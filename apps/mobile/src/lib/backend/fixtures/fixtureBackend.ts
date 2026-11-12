import { appStorage } from '../../storage';
import { BackendError, type Backend } from '../backend';
import type { Plan, Profile, Session } from '../types';
import {
  fixtureAddresses,
  fixtureBringItems,
  fixtureCities,
  fixturePlans,
} from './fixtureData';

// DEVELOPMENT FIXTURES ONLY: an in-app stand-in for the backend so the UI can be
// built and tested without a Supabase project. It imitates the rules enforced by
// supabase/migrations; the SQL (covered by supabase/tests) is the source of truth.

/** The only email code the fixtures accept. */
export const FIXTURE_EMAIL_CODE = '000000';
const STORAGE_KEY = 'pc.fixtures.v2';
const LATENCY_MS = 150;

interface State {
  session: Session | null;
  profile: Profile | null;
  goingPlanIds: string[];
  claimedItemIds: string[];
  /** The viewer's place in line per Plan; `expiresAt` is set while a spot is offered. */
  waitlist: Record<string, { expiresAt: string | null }>;
  /** Plans where another guest cancelled (test hook), freeing one spot. */
  freedPlanIds: string[];
}

type Operation =
  | 'listPlans'
  | 'getPlan'
  | 'joinPlan'
  | 'cancelRsvp'
  | 'claimBringItem'
  | 'joinWaitlist'
  | 'confirmOffer';

const OFFER_MS = 2 * 3_600_000;

interface FixtureHooks {
  /** Test hook: make the next call to `operation` fail as a network error. */
  __pcFixtures?: {
    failNext: (operation: Operation, times?: number) => void;
    /** Test hook: another guest cancels; the viewer (if in line) is offered the spot. */
    freeSpot: (planId: string, offerMs?: number) => void;
  };
  /** Test hook: failures to simulate from the very first call after load. */
  __pcFixtureFailures?: Partial<Record<Operation, number>>;
}
const hooks = globalThis as FixtureHooks;

const EMPTY: State = {
  session: null,
  profile: null,
  goingPlanIds: [],
  claimedItemIds: [],
  waitlist: {},
  freedPlanIds: [],
};

function removeOne(list: string[], value: string): string[] {
  const index = list.indexOf(value);
  return index < 0 ? list : [...list.slice(0, index), ...list.slice(index + 1)];
}

async function loadState(): Promise<State> {
  try {
    const raw = await appStorage.get(STORAGE_KEY);
    return raw ? { ...EMPTY, ...(JSON.parse(raw) as Partial<State>) } : EMPTY;
  } catch {
    // Corrupt dev state is not worth surfacing; start clean.
    return EMPTY;
  }
}

export async function createFixtureBackend(): Promise<Backend> {
  let state = await loadState();
  const listeners = new Set<(session: Session | null) => void>();
  const failures = new Map<Operation, number>(
    Object.entries(hooks.__pcFixtureFailures ?? {}) as [Operation, number][],
  );
  /** Idempotency keys already handled, as the real RPCs record them. */
  const seenKeys = new Set<string>();

  hooks.__pcFixtures = {
    failNext: (operation, times = 1) => {
      failures.set(operation, times);
    },
    freeSpot: (planId, offerMs = OFFER_MS) => {
      const inLine = planId in state.waitlist;
      commit({
        ...state,
        freedPlanIds: [...state.freedPlanIds, planId],
        waitlist: inLine
          ? {
              ...state.waitlist,
              [planId]: { expiresAt: new Date(Date.now() + offerMs).toISOString() },
            }
          : state.waitlist,
      });
    },
  };

  function commit(next: State, notify = false): void {
    state = next;
    // Persistence is best-effort for dev data.
    appStorage.set(STORAGE_KEY, JSON.stringify(state)).catch(() => undefined);
    if (notify) {
      for (const listener of listeners) listener(state.session);
    }
  }

  async function call(operation?: Operation): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, LATENCY_MS));
    const remaining = operation ? (failures.get(operation) ?? 0) : 0;
    if (operation && remaining > 0) {
      failures.set(operation, remaining - 1);
      throw new BackendError('network', 'Simulated network failure');
    }
  }

  function requireSession(): Session {
    if (!state.session) throw new BackendError('not_authenticated');
    return state.session;
  }

  /** True when this key was already processed (a retried request). */
  function replayed(key: string): boolean {
    if (seenKeys.has(key)) return true;
    seenKeys.add(key);
    return false;
  }

  function withoutEntry(planId: string): State['waitlist'] {
    return Object.fromEntries(Object.entries(state.waitlist).filter(([id]) => id !== planId));
  }

  /** The viewer's entry, or null once an offer has run out (as the server would report). */
  function liveEntry(planId: string): { expiresAt: string | null } | null {
    const entry = state.waitlist[planId];
    if (!entry) return null;
    if (entry.expiresAt && new Date(entry.expiresAt).getTime() <= Date.now()) return null;
    return entry;
  }

  const myName = () => state.profile?.displayName ?? 'You';

  function plans(now = new Date()): Plan[] {
    return fixturePlans(now).map((plan) => {
      const freed = state.freedPlanIds.filter((id) => id === plan.id).length;
      const going = plan.goingCount - freed + (state.goingPlanIds.includes(plan.id) ? 1 : 0);
      const waitlistCount = plan.waitlistCount + (plan.id in state.waitlist ? 1 : 0);
      return {
        ...plan,
        goingCount: going,
        waitlistCount,
        hasOpenSpot: going < plan.capacity && waitlistCount === 0,
      };
    });
  }

  function findPlan(planId: string): Plan {
    const plan = plans().find((candidate) => candidate.id === planId);
    if (!plan) throw new BackendError('not_found');
    return plan;
  }

  return {
    kind: 'fixtures',

    async getSession() {
      await call();
      return state.session;
    },

    onSessionChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    async signInWithOAuth(provider) {
      await call();
      const session = {
        userId: 'fixture-user',
        email: `lena@${provider}.example`,
        providerName: 'Lena',
      };
      commit({ ...state, session }, true);
    },

    async requestEmailCode() {
      await call();
    },

    async verifyEmailCode(email, code) {
      await call();
      if (code !== FIXTURE_EMAIL_CODE) throw new BackendError('invalid_code');
      commit(
        { ...state, session: { userId: 'fixture-user', email, providerName: null } },
        true,
      );
    },

    async signOut() {
      await call();
      commit(EMPTY, true);
    },

    async getProfile() {
      await call();
      requireSession();
      return state.profile;
    },

    async createProfile(input) {
      await call();
      requireSession();
      const profile = {
        displayName: input.displayName,
        cityId: input.cityId,
        goals: input.goals,
      };
      commit({ ...state, profile });
      return profile;
    },

    async listCities() {
      await call();
      return fixtureCities;
    },

    async listUpcomingPlans({ cityId, from, to }) {
      await call('listPlans');
      return plans(from)
        .filter((plan) => (!cityId || plan.cityId === cityId) && new Date(plan.startsAt) < to)
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    },

    async getPlan(planId) {
      await call('getPlan');
      const plan = findPlan(planId);
      const isGoing = state.goingPlanIds.includes(planId);
      const entry = liveEntry(planId);
      const revealed = Date.now() >= new Date(plan.revealAt).getTime();
      return {
        plan,
        rsvp: isGoing ? 'going' : entry ? (entry.expiresAt ? 'offered' : 'waitlisted') : 'none',
        // The viewer joined after the people already in the sample data.
        waitlistPosition: entry ? plan.waitlistCount : null,
        offerExpiresAt: entry?.expiresAt ?? null,
        address: isGoing && revealed ? (fixtureAddresses[planId] ?? null) : null,
        bringItems: fixtureBringItems
          .filter((item) => item.planId === planId)
          .map((item) => {
            const claimedByMe = state.claimedItemIds.includes(item.id);
            const claimedBy = claimedByMe ? [...item.claimedBy, myName()] : item.claimedBy;
            return {
              id: item.id,
              label: item.label,
              quantity: item.quantity,
              claimedCount: claimedBy.length,
              claimedBy,
              claimedByMe,
            };
          }),
      };
    },

    async getUpNext() {
      await call();
      requireSession();
      const plan = plans()
        .filter((candidate) => state.goingPlanIds.includes(candidate.id))
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];
      if (!plan) return null;
      const items = fixtureBringItems.filter((item) => item.planId === plan.id);
      const hasOpen = items.some(
        (item) =>
          item.claimedBy.length < item.quantity && !state.claimedItemIds.includes(item.id),
      );
      const claimedAny = items.some((item) => state.claimedItemIds.includes(item.id));
      return { plan, needsDish: hasOpen && !claimedAny };
    },

    async joinPlan(planId, key) {
      await call('joinPlan');
      requireSession();
      if (replayed(key) || state.goingPlanIds.includes(planId)) return;
      const plan = findPlan(planId);
      if (!plan.hasOpenSpot) throw new BackendError('plan_full');
      commit({ ...state, goingPlanIds: [...state.goingPlanIds, planId] });
    },

    async cancelRsvp(planId, key) {
      await call('cancelRsvp');
      requireSession();
      if (replayed(key)) return;
      const planItemIds = fixtureBringItems
        .filter((item) => item.planId === planId)
        .map((item) => item.id);
      commit({
        ...state,
        goingPlanIds: state.goingPlanIds.filter((id) => id !== planId),
        claimedItemIds: state.claimedItemIds.filter((id) => !planItemIds.includes(id)),
        waitlist: withoutEntry(planId),
      });
    },

    async joinWaitlist(planId, key) {
      await call('joinWaitlist');
      requireSession();
      findPlan(planId);
      if (replayed(key) || planId in state.waitlist || state.goingPlanIds.includes(planId))
        return;
      commit({ ...state, waitlist: { ...state.waitlist, [planId]: { expiresAt: null } } });
    },

    async confirmWaitlistOffer(planId, key) {
      await call('confirmOffer');
      requireSession();
      if (state.goingPlanIds.includes(planId)) return 'going';
      const entry = state.waitlist[planId];
      if (!entry) throw new BackendError('no_offer');
      if (replayed(key)) return 'going';
      if (!entry.expiresAt) return 'waitlisted';
      if (new Date(entry.expiresAt).getTime() <= Date.now()) {
        // Expired: the spot passes to the next person and the viewer leaves the line.
        commit({
          ...state,
          waitlist: withoutEntry(planId),
          freedPlanIds: removeOne(state.freedPlanIds, planId),
        });
        return 'expired';
      }
      commit({
        ...state,
        waitlist: withoutEntry(planId),
        goingPlanIds: [...state.goingPlanIds, planId],
      });
      return 'going';
    },

    async getWaitlistOffers() {
      await call();
      requireSession();
      return plans().flatMap((plan) => {
        const entry = liveEntry(plan.id);
        return entry?.expiresAt ? [{ plan, expiresAt: entry.expiresAt }] : [];
      });
    },

    async claimBringItem(itemId, key) {
      await call('claimBringItem');
      requireSession();
      const item = fixtureBringItems.find((candidate) => candidate.id === itemId);
      if (!item) throw new BackendError('not_found');
      if (replayed(key) || state.claimedItemIds.includes(itemId)) return;
      if (!state.goingPlanIds.includes(item.planId)) throw new BackendError('rsvp_required');
      if (item.claimedBy.length >= item.quantity) throw new BackendError('item_taken');
      commit({ ...state, claimedItemIds: [...state.claimedItemIds, itemId] });
    },
  };
}

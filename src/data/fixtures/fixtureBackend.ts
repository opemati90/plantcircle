import { ADDRESS_UNLOCK_HOURS } from '../../features/plans/planCopy';
import { BackendError, type Backend } from '../backend';
import type { Plan, Profile, Session } from '../types';
import { fixtureAddresses, fixtureBringItems, fixturePlans } from './fixtureData';

// DEVELOPMENT FIXTURES ONLY: an in-browser stand-in for the backend so the UI can
// be built and tested without a Supabase project. It imitates the rules enforced
// by supabase/migrations; the SQL (covered by tests/db) is the source of truth.

/** The only email code the fixtures accept. */
export const FIXTURE_EMAIL_CODE = '000000';
const STORAGE_KEY = 'pc.fixtures.v1';
const LATENCY_MS = 150;

interface State {
  session: Session | null;
  profile: Profile | null;
  goingPlanIds: string[];
  claimedItemIds: string[];
}

type Operation = 'listPlans' | 'getPlan' | 'joinPlan' | 'cancelRsvp' | 'claimBringItem';

declare global {
  interface Window {
    /** Test hook: make the next call to `operation` fail as a network error. */
    __pcFixtures?: { failNext: (operation: Operation, times?: number) => void };
    /** Test hook: failures to simulate from the very first call after load. */
    __pcFixtureFailures?: Partial<Record<Operation, number>>;
  }
}

function loadState(): State {
  const empty: State = { session: null, profile: null, goingPlanIds: [], claimedItemIds: [] };
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return empty;
  try {
    return { ...empty, ...(JSON.parse(raw) as Partial<State>) };
  } catch {
    // Corrupt dev state is not worth surfacing; start clean.
    sessionStorage.removeItem(STORAGE_KEY);
    return empty;
  }
}

export function createFixtureBackend(): Backend {
  let state = loadState();
  const listeners = new Set<(session: Session | null) => void>();
  const failures = new Map<Operation, number>(
    Object.entries(window.__pcFixtureFailures ?? {}) as [Operation, number][],
  );

  window.__pcFixtures = {
    failNext: (operation, times = 1) => {
      failures.set(operation, times);
    },
  };

  function commit(next: State, notify = false): void {
    state = next;
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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

  const myName = () => state.profile?.displayName ?? 'You';

  function plans(now = new Date()): Plan[] {
    return fixturePlans(now).map((plan) => {
      if (!state.goingPlanIds.includes(plan.id)) return plan;
      return { ...plan, goingCount: plan.goingCount + 1 };
    });
  }

  function findPlan(planId: string): Plan {
    const plan = plans().find((candidate) => candidate.id === planId);
    if (!plan) throw new BackendError('not_found');
    return plan;
  }

  function signIn(session: Session): void {
    commit({ ...state, session }, true);
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

    async signInWithOAuth(provider, returnTo) {
      await call();
      signIn({
        userId: 'fixture-user',
        email: `lena@${provider}.example`,
        providerName: 'Lena',
      });
      window.location.assign(returnTo);
    },

    async requestEmailCode() {
      await call();
    },

    async verifyEmailCode(email, code) {
      await call();
      if (code !== FIXTURE_EMAIL_CODE) throw new BackendError('invalid_code');
      signIn({ userId: 'fixture-user', email, providerName: null });
    },

    async signOut() {
      await call();
      commit({ session: null, profile: null, goingPlanIds: [], claimedItemIds: [] }, true);
    },

    async getProfile() {
      await call();
      requireSession();
      return state.profile;
    },

    async createProfile(input) {
      await call();
      requireSession();
      const profile = { displayName: input.displayName, city: input.city, goals: input.goals };
      commit({ ...state, profile });
      return profile;
    },

    async listUpcomingPlans({ city, from, to }) {
      await call('listPlans');
      return plans(from)
        .filter((plan) => plan.city === city && new Date(plan.startsAt) < to)
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    },

    async getPlan(planId) {
      await call('getPlan');
      const plan = findPlan(planId);
      const isGoing = state.goingPlanIds.includes(planId);
      const unlocked =
        Date.now() >= new Date(plan.startsAt).getTime() - ADDRESS_UNLOCK_HOURS * 3_600_000;
      return {
        plan,
        isGoing,
        address: isGoing && unlocked ? (fixtureAddresses[planId] ?? null) : null,
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

    async joinPlan(planId) {
      await call('joinPlan');
      requireSession();
      if (state.goingPlanIds.includes(planId)) return;
      const plan = findPlan(planId);
      if (plan.goingCount >= plan.capacity) throw new BackendError('plan_full');
      commit({ ...state, goingPlanIds: [...state.goingPlanIds, planId] });
    },

    async cancelRsvp(planId) {
      await call('cancelRsvp');
      requireSession();
      const planItemIds = fixtureBringItems
        .filter((item) => item.planId === planId)
        .map((item) => item.id);
      commit({
        ...state,
        goingPlanIds: state.goingPlanIds.filter((id) => id !== planId),
        claimedItemIds: state.claimedItemIds.filter((id) => !planItemIds.includes(id)),
      });
    },

    async claimBringItem(itemId) {
      await call('claimBringItem');
      requireSession();
      const item = fixtureBringItems.find((candidate) => candidate.id === itemId);
      if (!item) throw new BackendError('not_found');
      if (!state.goingPlanIds.includes(item.planId)) throw new BackendError('rsvp_required');
      if (state.claimedItemIds.includes(itemId)) return;
      if (item.claimedBy.length >= item.quantity) throw new BackendError('item_taken');
      commit({ ...state, claimedItemIds: [...state.claimedItemIds, itemId] });
    },
  };
}

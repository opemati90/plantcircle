import { appStorage } from '../../storage';
import { BackendError, type Backend } from '../backend';
import {
  isRecipeAllergen,
} from '../types';
import type {
  Circle,
  CircleRequest,
  FeedbackState,
  GuestState,
  HostSummary,
  MyPlan,
  Plan,
  Profile,
  Person,
  Recipe,
  RecipeDetail,
  Session,
} from '../types';
import {
  fixtureAddresses,
  fixtureCircles,
  fixtureRecipes,
  fixtureMeetingUrls,
  fixtureBringItems,
  type FixtureBringItem,
  fixtureCities,
  fixturePeople,
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
  /** Circles the person has joined, asked to join, or created (with when, to rate-limit). */
  circlesJoined: string[];
  circlesRequested: string[];
  circlesCreated: Circle[];
  circlesCreatedAt: string[];
  /** Waiting requests to the request Circles the person created, keyed by Circle id. */
  circleRequests: (CircleRequest & { circleId: string })[];
  recipesCreated: RecipeDetail[];
  /** Members the viewer has asked to connect with (mirrors the connections table). */
  peopleRequested: string[];
  /** Plans the person published in this session, shown alongside the fixture Plans. */
  plansCreated: Plan[];
  /** The private details of Plans this person published: the host always sees them. */
  plansSecrets: Record<string, { address: string | null; meetingUrl: string | null }>;
  /** Guests on the Plans this person hosts. Seeded on publish, like the sample requests. */
  plansGuests: Record<string, { userId: string; displayName: string; state: GuestState; checkedInAt: string | null }[]>;
  /** Plans the host has ended in this session. */
  plansEnded: string[];
  /** Bring items the host added or changed in this session (the sample items are read-only). */
  bringCreated: FixtureBringItem[];
  /** Group chat messages by conversation id; a client id makes a send idempotent. */
  /** Direct conversations open with these people (their ids). */
  directOpen: string[];
  /** First-message requests: incoming ones from people in the viewer's Circles, and the viewer's own. */
  directIncoming: { id: string; fromId: string; fromName: string; firstMessage: string; createdAt: string; status: 'pending' | 'accepted' | 'declined' }[];
  /** The viewer's requests, by recipient: the first message and when it was sent. */
  directOutgoing: Record<string, { firstMessage: string; createdAt: string; clientId: string }>;
  /** Mute and pin per conversation, for this person. */
  conversationSettings: Record<string, { mutedUntil: string | null; pinned: boolean; lastReadAt?: string | null }>;
  messages: Record<string, { id: string; clientId: string; senderId: string; senderName: string; body: string; createdAt: string }[]>;
  /** The viewer's feedback on Plans, by Plan id. */
  feedbackMine: Record<string, { rating: number; comment: string | null }>;
  /** Keyed creations, so a retry replays the same result as the database does. */
  idempotent: Record<string, { fingerprint: string; id: string }>;
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
  circlesJoined: [],
  circlesRequested: [],
  circlesCreated: [],
  circlesCreatedAt: [],
  circleRequests: [],
  recipesCreated: [],
  peopleRequested: [],
  plansCreated: [],
  plansSecrets: {},
  plansGuests: {},
  plansEnded: [],
  bringCreated: [],
  messages: {},
  directOpen: [],
  directIncoming: [
    {
      id: 'dm-mia-k',
      fromId: 'fixture-mia-k',
      fromName: 'Mia K.',
      firstMessage: 'Hi, are you bringing the lentils?',
      createdAt: '2026-11-02T10:00:00Z',
      status: 'pending',
    },
  ],
  directOutgoing: {},
  conversationSettings: {},
  feedbackMine: {},
  idempotent: {},
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

  const normalizeWords = (text: string): string[] =>
    text
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);

  type ChatKind = 'plan' | 'circle' | 'direct';

/** The kind and id a fixture conversation id was made from ("conv-plan-<id>", "conv-circle-<id>"). */
  function conversationRef(conversationId: string): { kind: ChatKind; refId: string } {
    const [, kind, ...rest] = conversationId.split('-');
    const parsed: ChatKind = kind === 'plan' ? 'plan' : kind === 'direct' ? 'direct' : 'circle';
    return { kind: parsed, refId: rest.join('-') };
  }

  /** Who may use a group chat in the fixture: a Plan's host and people going, or a Circle's members. */
  function chatMember(kind: ChatKind, refId: string): boolean {
    if (kind === 'direct') return state.directOpen.includes(refId);
    if (kind === 'plan') {
      const hosted = state.plansCreated.some((p) => p.id === refId);
      return hosted || state.goingPlanIds.includes(refId);
    }
    return (
      state.circlesJoined.includes(refId) || state.circlesCreated.some((c) => c.id === refId)
    );
  }

  /** Only the host of a Plan may see its guests and summary. */
  function requireHost(planId: string): void {
    requireSession();
    if (!state.plansCreated.some((p) => p.id === planId)) throw new BackendError('forbidden');
  }

  /** Bring items change only while the Plan is live: before its scheduled end, and not ended. */
  function requireLive(planId: string): void {
    const plan = findPlan(planId);
    if (state.plansEnded.includes(planId) || Date.now() >= new Date(plan.endsAt).getTime()) {
      throw new BackendError('invalid_input');
    }
  }

  /** The same window as the database: from two hours before the start to two after the end. */
  function checkinOpen(plan: Plan): boolean {
    const now = Date.now();
    return (
      !state.plansEnded.includes(plan.id) &&
      now >= new Date(plan.startsAt).getTime() - 2 * 3_600_000 &&
      now <= new Date(plan.endsAt).getTime() + 2 * 3_600_000
    );
  }

  /** Fixture members who chose to be visible, shown only to people in the same Circles. */
  const visiblePeople = (): Person[] => {
    const circleIds = new Set([
      ...state.circlesJoined,
      ...state.circlesCreated.map((c) => c.id),
    ]);
    return fixturePeople
      .filter((p) => circleIds.has(p.circleId))
      .map(({ person }) => ({
        ...person,
        connection: state.peopleRequested.includes(person.userId)
          ? person.connection === 'requested_by_them'
            ? 'connected'
            : 'requested'
          : person.connection,
      }));
  };

  /** Recipes in Circles the viewer has joined or started, newest first. */
  const visibleRecipes = (): RecipeDetail[] => {
    const circleIds = new Set([
      ...state.circlesJoined,
      ...state.circlesCreated.map((c) => c.id),
    ]);
    return [...fixtureRecipes, ...state.recipesCreated]
      .filter((r) => circleIds.has(r.circleId))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  };

  const summaryOf = (r: RecipeDetail): Recipe => ({
    id: r.id,
    title: r.title,
    cuisine: r.cuisine,
    serves: r.serves,
    minutes: r.minutes,
    intro: r.intro,
    allergens: r.allergens,
    allergensConfirmed: r.allergensConfirmed,
    circleId: r.circleId,
    circleName: r.circleName,
    authorName: r.authorName,
    createdAt: r.createdAt,
  });

  /** Property order must not change a request's identity, so keys are sorted before comparing. */
  const fingerprintOf = (value: unknown): string =>
    JSON.stringify(value, (_key, item: unknown) =>
      item && typeof item === 'object' && !Array.isArray(item)
        ? Object.fromEntries(
            Object.entries(item).sort(([a], [b]) => a.localeCompare(b)),
          )
        : item,
    );

  /** A keyed creation seen before: the same input replays its result; different input is refused. */
  const replayKey = (key: string, fingerprint: string): string | null => {
    const seen = state.idempotent[key];
    if (!seen) return null;
    if (seen.fingerprint !== fingerprint) throw new BackendError('invalid_input', 'idempotency_key_reused');
    return seen.id;
  };

  /** The viewer's own standing in a Circle, as the database view reports it. */
  const withViewer = (circle: Circle): Circle => {
    const joined = state.circlesJoined.includes(circle.id);
    return {
      ...circle,
      memberCount: circle.memberCount + (joined ? 1 : 0),
      viewerRole: state.circlesCreated.some((c) => c.id === circle.id)
        ? 'owner'
        : joined
          ? 'member'
          : null,
      viewerRequestPending: state.circlesRequested.includes(circle.id),
    };
  };

  function plans(now = new Date()): Plan[] {
    return [...fixturePlans(now), ...state.plansCreated].map((plan) => {
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
        peopleVisible: false,
      };
      commit({ ...state, profile });
      return profile;
    },

    async listMyCircles() {
      await call();
      requireSession();
      return [...fixtureCircles, ...state.circlesCreated]
        .map(withViewer)
        .filter((c) => c.viewerRole !== null);
    },

    async listCircles({ search }) {
      await call();
      const words = search.trim().toLowerCase();
      return [...fixtureCircles, ...state.circlesCreated]
        .map(withViewer)
        .filter((c) => !words || `${c.name} ${c.tagline ?? ''}`.toLowerCase().includes(words));
    },

    async getCircle(circleId) {
      await call();
      const circle = [...fixtureCircles, ...state.circlesCreated].find(
        (c) => c.id === circleId,
      );
      if (!circle) throw new BackendError('not_found');
      return withViewer(circle);
    },

    async joinCircle(circleId) {
      await call();
      requireSession();
      const circle = [...fixtureCircles, ...state.circlesCreated].find(
        (c) => c.id === circleId,
      );
      if (!circle || circle.access === 'invite') throw new BackendError('not_found');
      const view = withViewer(circle);
      if (view.viewerRole) return 'member';
      if (circle.access === 'open') {
        commit({ ...state, circlesJoined: [...state.circlesJoined, circleId] });
        return 'member';
      }
      if (!state.circlesRequested.includes(circleId)) {
        commit({ ...state, circlesRequested: [...state.circlesRequested, circleId] });
      }
      return 'requested';
    },

    async createCircle(input, key) {
      await call();
      requireSession();
      const fingerprint = fingerprintOf(input);
      const replayed = replayKey(key, fingerprint);
      if (replayed) return replayed;
      const now = Date.now();
      const recent = state.circlesCreatedAt.filter(
        (at) => now - new Date(at).getTime() < 86_400_000,
      );
      if (recent.length >= 3) throw new BackendError('rate_limited');
      const city = fixtureCities.find((c) => c.id === input.cityId);
      const circle: Circle = {
        id: `created-${now}-${key.slice(0, 8)}`,
        name: input.name,
        tagline: input.tagline,
        cityId: input.cityId,
        city: city?.name ?? null,
        isGlobal: false,
        access: input.access,
        joinQuestion: input.joinQuestion,
        memberCount: 1,
        viewerRole: 'owner',
        viewerRequestPending: false,
      };
      // A request Circle opens with one waiting request, so the approval flow can be tried locally.
      const seeded =
        input.access === 'request'
          ? [
              {
                id: `request-${circle.id}`,
                circleId: circle.id,
                displayName: 'Mia K.',
                answer: 'I cook plant-based most weeks and would like to learn more.',
                createdAt: new Date(now).toISOString(),
              },
            ]
          : [];
      commit({
        ...state,
        circlesCreated: [...state.circlesCreated, circle],
        circlesCreatedAt: [...state.circlesCreatedAt, new Date(now).toISOString()],
        idempotent: { ...state.idempotent, [key]: { fingerprint, id: circle.id } },
        circleRequests: [...state.circleRequests, ...seeded],
      });
      return circle.id;
    },

    async getCircleRequests(circleId) {
      await call();
      requireSession();
      const owns = state.circlesCreated.some((c) => c.id === circleId);
      if (!owns) throw new BackendError('forbidden');
      return state.circleRequests
        .filter((r) => r.circleId === circleId)
        .map((r) => ({
          id: r.id,
          displayName: r.displayName,
          answer: r.answer,
          createdAt: r.createdAt,
        }));
    },

    async respondToCircleRequest(requestId) {
      await call();
      requireSession();
      const request = state.circleRequests.find((r) => r.id === requestId);
      if (!request) throw new BackendError('not_found');
      const owns = state.circlesCreated.some((c) => c.id === request.circleId);
      if (!owns) throw new BackendError('forbidden');
      commit({
        ...state,
        circleRequests: state.circleRequests.filter((r) => r.id !== requestId),
      });
    },

    async listRecipes({ search }) {
      await call();
      const words = normalizeWords(search);
      return visibleRecipes()
        .map(summaryOf)
        .filter((r) => {
          const haystack = normalizeWords(`${r.title} ${r.cuisine ?? ''} ${r.intro ?? ''}`).join(' ');
          return words.every((word) => haystack.includes(word));
        });
    },

    async getRecipe(recipeId) {
      await call();
      const recipe = visibleRecipes().find((r) => r.id === recipeId);
      if (!recipe) throw new BackendError('not_found');
      return recipe;
    },

    async createRecipe(input, key) {
      await call();
      requireSession();
      const fingerprint = fingerprintOf(input);
      const replayed = replayKey(key, fingerprint);
      if (replayed) return replayed;
      const inCircle = [...state.circlesJoined, ...state.circlesCreated.map((c) => c.id)].includes(
        input.circleId,
      );
      if (!inCircle) throw new BackendError('not_found');
      if (input.allergensConfirmed && input.allergens.length === 0) {
        throw new BackendError('invalid_input');
      }
      if (input.ingredients.length === 0 || input.steps.length === 0) {
        throw new BackendError('invalid_input');
      }
      const circleName =
        [...fixtureCircles, ...state.circlesCreated].find((c) => c.id === input.circleId)?.name ??
        '';
      const recipe: RecipeDetail = {
        id: `recipe-${Date.now()}-${key.slice(0, 8)}`,
        title: input.title,
        cuisine: input.cuisine,
        serves: input.serves,
        minutes: input.minutes,
        intro: input.intro,
        allergens: input.allergensConfirmed ? input.allergens : [],
        allergensConfirmed: input.allergensConfirmed,
        circleId: input.circleId,
        circleName,
        authorName: myName(),
        createdAt: new Date().toISOString(),
        ingredients: input.ingredients,
        steps: input.steps,
      };
      commit({
        ...state,
        recipesCreated: [...state.recipesCreated, recipe],
        idempotent: { ...state.idempotent, [key]: { fingerprint, id: recipe.id } },
      });
      return recipe.id;
    },

    async createPlan(input, key) {
      await call();
      requireSession();
      const fingerprint = fingerprintOf(input);
      const replayed = replayKey(key, fingerprint);
      if (replayed) return replayed;
      const city = fixtureCities.find((c) => c.id === state.profile?.cityId);
      if (!state.profile?.cityId || !city) throw new BackendError('city_required');
      const now = Date.now();
      const starts = Date.parse(input.startsAt);
      const ends = Date.parse(input.endsAt);
      // The same rules as plan_create: trimmed text, characters (not UTF-16 units), known allergens,
      // "none" alone, and a meeting link with a real host.
      const title = input.title.trim();
      const area = (input.areaName ?? '').trim();
      const address = (input.address ?? '').trim();
      const link = (input.meetingUrl ?? '').trim();
      const knownAllergens = input.allergens.every((a) => isRecipeAllergen(a));
      const noneAlone = !input.allergens.includes('none') || input.allergens.length === 1;
      const invalid =
        input.allergens.length === 0 ||
        !knownAllergens ||
        !noneAlone ||
        Array.from(title).length < 3 ||
        Array.from(title).length > 80 ||
        starts <= now + 3_600_000 ||
        Array.from(input.description.trim()).length > 2000 ||
        Number.isNaN(starts) ||
        Number.isNaN(ends) ||
        ends - starts < 30 * 60_000 ||
        ends - starts > 8 * 3_600_000 ||
        input.capacity < 2 ||
        input.capacity > 50 ||
        (input.format === 'online'
          ? Array.from(link).length > 500 || !/^https:\/\/[^\s/?#@:]+\.[^\s/?#@:]+([/?#]\S*)?$/.test(link)
          : Array.from(area).length < 1 || Array.from(area).length > 60 || Array.from(address).length < 1 || Array.from(address).length > 200);
      if (invalid) throw new BackendError('invalid_input');
      const plan: Plan = {
        id: `plan-${now}-${key.slice(0, 8)}`,
        title,
        category: input.category,
        format: input.format,
        cityId: city.id,
        city: city.name,
        areaName: input.format === 'online' ? city.name : area,
        venueName: null,
        areaHint: null,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        revealAt: input.keepAddressPrivate
          ? new Date(starts - 86_400_000).toISOString()
          : new Date(now).toISOString(),
        timezone: city.timezone,
        capacity: input.capacity,
        priceCents: 0,
        currency: 'EUR',
        description: input.description.trim(),
        allergens: input.allergens.join(','),
        imagePath: null,
        imageAlt: null,
        imageFocus: null,
        hostName: myName(),
        hostVerified: false,
        hostPlansCount: 1,
        goingCount: 0,
        attendeeInitials: [],
        openBringSlots: 0,
        waitlistCount: 0,
        hasOpenSpot: true,
      };
      commit({
        ...state,
        plansCreated: [...state.plansCreated, plan],
        plansGuests: {
          ...state.plansGuests,
          // The host is on their own list, so the check-in flow can be tried from the host's side.
          [plan.id]: [
            {
              userId: state.session?.userId ?? 'fixture-you',
              displayName: myName(),
              state: 'going',
              checkedInAt: null,
            },
            { userId: 'fixture-mia-k', displayName: 'Mia K.', state: 'going', checkedInAt: null },
            { userId: 'fixture-jonas-k', displayName: 'Jonas K.', state: 'waitlisted', checkedInAt: null },
          ],
        },
        plansSecrets: {
          ...state.plansSecrets,
          [plan.id]: {
            address: input.format === 'online' ? null : address,
            meetingUrl: input.format === 'online' ? link : null,
          },
        },
        idempotent: { ...state.idempotent, [key]: { fingerprint, id: plan.id } },
      });
      return plan.id;
    },

    async listGuests(planId) {
      await call();
      requireHost(planId);
      return (state.plansGuests[planId] ?? []).map((g) => ({
        userId: g.userId,
        displayName: g.displayName,
        state: g.state,
        checkedInAt: g.checkedInAt,
      }));
    },

    async getHostSummary(planId) {
      await call();
      requireHost(planId);
      const guests = state.plansGuests[planId] ?? [];
      const mine = state.feedbackMine[planId];
      return {
        going: guests.filter((g) => g.state === 'going').length,
        checkedIn: guests.filter((g) => g.state === 'checked_in').length,
        noShow: guests.filter((g) => g.state === 'no_show').length,
        ended: state.plansEnded.includes(planId),
        live: !state.plansEnded.includes(planId),
        feedbackCount: mine ? 1 : 0,
        averageRating: mine ? mine.rating : null,
      } satisfies HostSummary;
    },

    async checkInGuest(planId, userId, checkedIn, key) {
      await call();
      requireHost(planId);
      const fingerprint = `host_check_in:${planId}:${userId}:${checkedIn}`;
      const replayed = replayKey(key, fingerprint);
      if (replayed) return replayed as 'going' | 'checked_in';
      const plan = findPlan(planId);
      if (!checkinOpen(plan)) throw new BackendError('checkin_closed');
      const guests = state.plansGuests[planId] ?? [];
      const guest = guests.find((g) => g.userId === userId);
      if (!guest || (guest.state !== 'going' && guest.state !== 'checked_in')) {
        throw new BackendError('not_found');
      }
      const nextState: 'going' | 'checked_in' = checkedIn ? 'checked_in' : 'going';
      const updated = guests.map((g) =>
        g.userId === userId
          ? { ...g, state: nextState, checkedInAt: checkedIn ? new Date().toISOString() : null }
          : g,
      );
      commit({
        ...state,
        plansGuests: { ...state.plansGuests, [planId]: updated },
        idempotent: { ...state.idempotent, [key]: { fingerprint, id: nextState } },
      });
      return nextState;
    },

    async endPlan(planId, key) {
      await call();
      requireHost(planId);
      const fingerprint = `host_end_plan:${planId}`;
      if (replayKey(key, fingerprint)) return;
      const plan = findPlan(planId);
      if (Date.now() < new Date(plan.startsAt).getTime()) throw new BackendError('plan_not_started');
      if (state.plansEnded.includes(planId)) throw new BackendError('invalid_input');
      // Going guests who did not check in are no-shows; people still waiting are dropped.
      const guests = (state.plansGuests[planId] ?? [])
        .filter((g) => g.state !== 'waitlisted' && g.state !== 'offered')
        .map((g) => (g.state === 'going' ? { ...g, state: 'no_show' as const } : g));
      commit({
        ...state,
        plansEnded: [...state.plansEnded, planId],
        plansGuests: { ...state.plansGuests, [planId]: guests },
        idempotent: { ...state.idempotent, [key]: { fingerprint, id: 'completed' } },
      });
    },

    async getFeedback(planId) {
      await call();
      requireSession();
      // The database's rule: checked in, and the Plan has ended by its scheduled end time.
      const plan = findPlan(planId);
      const me = (state.plansGuests[planId] ?? []).find(
        (g) => g.userId === (state.session?.userId ?? 'fixture-you'),
      );
      const eligible = me?.state === 'checked_in' && Date.now() >= new Date(plan.endsAt).getTime();
      const mine = state.feedbackMine[planId];
      return {
        eligible,
        rating: mine?.rating ?? null,
        comment: mine?.comment ?? null,
      } satisfies FeedbackState;
    },

    async submitFeedback(planId, rating, comment, key) {
      await call();
      requireSession();
      const fingerprint = `plan_feedback:${planId}:${rating}:${comment ?? ''}`;
      if (replayKey(key, fingerprint)) return;
      if (!state.plansEnded.includes(planId) || !state.goingPlanIds.includes(planId)) {
        throw new BackendError('invalid_input');
      }
      if (rating < 1 || rating > 5) throw new BackendError('invalid_input');
      commit({
        ...state,
        feedbackMine: { ...state.feedbackMine, [planId]: { rating, comment } },
        idempotent: { ...state.idempotent, [key]: { fingerprint, id: planId } },
      });
    },

    async openConversation(kind, refId) {
      await call();
      requireSession();
      if (!chatMember(kind, refId)) throw new BackendError('closed_chat');
      return `conv-${kind}-${refId}`;
    },

    async listMessages(conversationId) {
      await call();
      requireSession();
      const { kind, refId } = conversationRef(conversationId);
      if (!chatMember(kind, refId)) throw new BackendError('closed_chat');
      return (state.messages[conversationId] ?? []).map((m) => ({
        id: m.id,
        senderId: m.senderId,
        senderName: m.senderName,
        body: m.body,
        createdAt: m.createdAt,
      }));
    },

    async sendMessage(conversationId, body, clientId) {
      await call();
      requireSession();
      const { kind, refId } = conversationRef(conversationId);
      if (!chatMember(kind, refId)) {
        throw new BackendError('closed_chat');
      }
      const me = state.session?.userId ?? 'fixture-you';
      const existing = state.messages[conversationId] ?? [];
      // Like the database: a client id is unique per sender across every conversation.
      const everything = Object.values(state.messages).flat();
      if (everything.some((m) => m.clientId === clientId && m.senderId === me)) return;
      const text = body.trim();
      if (Array.from(text).length < 1 || Array.from(text).length > 1000) {
        throw new BackendError('invalid_input');
      }
      const recent = everything.filter(
        (m) => m.senderId === me && Date.now() - new Date(m.createdAt).getTime() < 60_000,
      );
      if (recent.length >= 20) throw new BackendError('rate_limited');
      commit({
        ...state,
        messages: {
          ...state.messages,
          [conversationId]: [
            ...existing,
            {
              id: `msg-${Date.now()}-${clientId.slice(0, 8)}`,
              clientId,
              senderId: me,
              senderName: myName(),
              body: text,
              createdAt: new Date().toISOString(),
            },
          ],
        },
      });
    },

    async requestDirect(userId, firstMessage, clientId) {
      await call();
      requireSession();
      if (state.directOpen.includes(userId)) {
        return { status: 'accepted', conversationId: `conv-direct-${userId}` };
      }
      // A request already made reads as pending, whatever the recipient decided (a decline is silent).
      // A retry with the same client id, or any request already made, reads as pending.
      if (state.directOutgoing[userId]) return { status: 'pending' };
      if (!visiblePeople().some((p) => p.userId === userId)) throw new BackendError('person_not_found');
      const text = firstMessage.trim();
      if (Array.from(text).length < 1 || Array.from(text).length > 1000) {
        throw new BackendError('invalid_input');
      }
      // Ten requests in a rolling 24 hours, as the database counts them.
      const now = Date.now();
      const sentLastDay = Object.values(state.directOutgoing).filter(
        (r) => now - new Date(r.createdAt).getTime() < 86_400_000,
      ).length;
      if (sentLastDay >= 10) throw new BackendError('rate_limited');
      commit({
        ...state,
        directOutgoing: {
          ...state.directOutgoing,
          [userId]: { firstMessage: text, createdAt: new Date(now).toISOString(), clientId },
        },
      });
      return { status: 'pending' };
    },

    async listDirectRequests() {
      await call();
      requireSession();
      return state.directIncoming
        .filter((r) => r.status === 'pending')
        .map((r) => ({
          id: r.id,
          fromId: r.fromId,
          fromName: r.fromName,
          firstMessage: r.firstMessage,
          createdAt: r.createdAt,
        }));
    },

    async respondDirectRequest(requestId, accept) {
      await call();
      requireSession();
      const request = state.directIncoming.find((r) => r.id === requestId);
      if (!request) throw new BackendError('not_found');
      if (request.status !== 'pending') return request.status === 'accepted' ? 'accepted' : 'declined';
      const conversationId = `conv-direct-${request.fromId}`;
      const status: 'accepted' | 'declined' = accept ? 'accepted' : 'declined';
      commit({
        ...state,
        directIncoming: state.directIncoming.map((r) => (r.id === requestId ? { ...r, status } : r)),
        directOpen: accept ? [...state.directOpen, request.fromId] : state.directOpen,
        messages: accept
          ? {
              ...state.messages,
              [conversationId]: [
                {
                  id: `msg-${requestId}`,
                  clientId: requestId,
                  senderId: request.fromId,
                  senderName: request.fromName,
                  body: request.firstMessage,
                  createdAt: request.createdAt,
                },
              ],
            }
          : state.messages,
      });
      return status;
    },

    async getConversationSettings(conversationId) {
      await call();
      requireSession();
      return state.conversationSettings[conversationId] ?? { mutedUntil: null, pinned: false };
    },

    async setMutedUntil(conversationId, until) {
      await call();
      requireSession();
      const { kind, refId } = conversationRef(conversationId);
      if (!chatMember(kind, refId)) throw new BackendError('closed_chat');
      const current = state.conversationSettings[conversationId] ?? { mutedUntil: null, pinned: false };
      commit({
        ...state,
        conversationSettings: {
          ...state.conversationSettings,
          [conversationId]: { ...current, mutedUntil: until },
        },
      });
    },

    async setPinned(conversationId, pinned) {
      await call();
      requireSession();
      const { kind, refId } = conversationRef(conversationId);
      if (!chatMember(kind, refId)) throw new BackendError('closed_chat');
      const current = state.conversationSettings[conversationId] ?? { mutedUntil: null, pinned: false };
      commit({
        ...state,
        conversationSettings: { ...state.conversationSettings, [conversationId]: { ...current, pinned } },
      });
    },

    async listInbox() {
      await call();
      requireSession();
      const me = state.session?.userId ?? 'fixture-you';
      const places: { kind: 'plan' | 'circle' | 'direct'; refId: string; title: string }[] = [
        ...plans()
          .filter((p) => state.goingPlanIds.includes(p.id) || state.plansCreated.some((c) => c.id === p.id))
          .map((p) => ({ kind: 'plan' as const, refId: p.id, title: p.title })),
        ...[...fixtureCircles, ...state.circlesCreated]
          .filter((c) => state.circlesJoined.includes(c.id) || state.circlesCreated.some((x) => x.id === c.id))
          .map((c) => ({ kind: 'circle' as const, refId: c.id, title: c.name })),
        ...state.directOpen.map((id) => ({
          kind: 'direct' as const,
          refId: id,
          title: fixturePeople.find((p) => p.person.userId === id)?.person.displayName ?? id,
        })),
      ];
      const threads = places.map((place) => {
        const conversationId = `conv-${place.kind}-${place.refId}`;
        const messages = state.messages[conversationId] ?? [];
        const last = messages[messages.length - 1];
        const settings = state.conversationSettings[conversationId];
        const readAt = settings?.lastReadAt ? new Date(settings.lastReadAt).getTime() : -Infinity;
        const unread = messages.filter(
          (m) => m.senderId !== me && new Date(m.createdAt).getTime() > readAt,
        ).length;
        return {
          conversationId: messages.length > 0 || settings ? conversationId : null,
          kind: place.kind,
          refId: place.refId,
          title: place.title,
          lastBody: last?.body ?? null,
          lastSenderName: last?.senderName ?? null,
          lastAt: last?.createdAt ?? null,
          unread,
          pinned: settings?.pinned ?? false,
          muted: settings?.mutedUntil ? new Date(settings.mutedUntil).getTime() > Date.now() : false,
          imagePath: place.kind === 'plan' ? (plans().find((p) => p.id === place.refId)?.imagePath ?? null) : null,
        };
      });
      return threads.sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return (b.lastAt ?? '').localeCompare(a.lastAt ?? '') || a.title.localeCompare(b.title);
      });
    },

    async markConversationRead(conversationId, upTo) {
      await call();
      requireSession();
      const { kind, refId } = conversationRef(conversationId);
      if (!chatMember(kind, refId)) throw new BackendError('closed_chat');
      const current = state.conversationSettings[conversationId] ?? { mutedUntil: null, pinned: false };
      commit({
        ...state,
        conversationSettings: {
          ...state.conversationSettings,
          // Never backwards, never past what was shown.
          [conversationId]: {
            ...current,
            lastReadAt:
              current.lastReadAt && current.lastReadAt > upTo ? current.lastReadAt : upTo,
          },
        },
      });
    },

    async listPeople() {
      await call();
      requireSession();
      return visiblePeople();
    },

    async connectWithPerson(userId, key) {
      await call();
      requireSession();
      const fingerprint = `person_connect:${userId}`;
      const replayed = replayKey(key, fingerprint);
      if (replayed) return replayed as 'requested' | 'connected';
      const person = visiblePeople().find((p) => p.userId === userId);
      if (!person) throw new BackendError('not_found');
      // Asking back, or connecting with someone who already asked, makes it mutual.
      const status =
        person.connection === 'requested_by_them' || person.connection === 'connected'
          ? 'connected'
          : 'requested';
      commit({
        ...state,
        peopleRequested: state.peopleRequested.includes(userId)
          ? state.peopleRequested
          : [...state.peopleRequested, userId],
        idempotent: { ...state.idempotent, [key]: { fingerprint, id: status } },
      });
      return status;
    },

    async setPeopleVisible(visible) {
      await call();
      requireSession();
      if (!state.profile) throw new BackendError('not_found');
      commit({ ...state, profile: { ...state.profile, peopleVisible: visible } });
    },

    async setCity(cityId) {
      await call();
      requireSession();
      if (!state.profile) throw new BackendError('not_found');
      commit({ ...state, profile: { ...state.profile, cityId } });
    },

    async listCities() {
      await call();
      return fixtureCities;
    },

    async listUpcomingPlans({ cityIds, from, to }) {
      await call('listPlans');
      return plans(from)
        .filter(
          (plan) => (!cityIds || cityIds.includes(plan.cityId)) && new Date(plan.startsAt) < to,
        )
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    },

    async getPlan(planId) {
      await call('getPlan');
      const plan = findPlan(planId);
      const isGoing = state.goingPlanIds.includes(planId);
      const entry = liveEntry(planId);
      const revealed = Date.now() >= new Date(plan.revealAt).getTime();
      const hosted = state.plansSecrets[planId] ?? null;
      return {
        plan,
        rsvp: isGoing ? 'going' : entry ? (entry.expiresAt ? 'offered' : 'waitlisted') : 'none',
        // The viewer joined after the people already in the sample data.
        waitlistPosition: entry ? plan.waitlistCount : null,
        offerExpiresAt: entry?.expiresAt ?? null,
        // The host of a Plan published in this session always sees its own details.
        address: hosted
          ? hosted.address
          : isGoing && revealed
            ? (fixtureAddresses[planId] ?? null)
            : null,
        meetingUrl: hosted
          ? hosted.meetingUrl
          : isGoing && revealed
            ? (fixtureMeetingUrls[planId] ?? null)
            : null,
        bringItems: [
          ...fixtureBringItems,
          ...state.bringCreated,
        ]
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

    async listMyPlans({ scope, now }) {
      await call();
      requireSession();
      const mine = plans(now).flatMap((plan): MyPlan[] => {
        const entry = liveEntry(plan.id);
        const isGoing = state.goingPlanIds.includes(plan.id);
        const isUpcoming = new Date(plan.endsAt).getTime() >= now.getTime();
        if (scope === 'upcoming' ? !isUpcoming : isUpcoming) return [];
        if (isGoing) {
          return [{ plan, rsvp: 'going', waitlistPosition: null, offerExpiresAt: null }];
        }
        if (!entry) return [];
        return [
          {
            plan,
            rsvp: entry.expiresAt ? 'offered' : 'waitlisted',
            waitlistPosition: plan.waitlistCount,
            offerExpiresAt: entry.expiresAt,
          },
        ];
      });
      const direction = scope === 'upcoming' ? 1 : -1;
      return mine.sort(
        (a, b) =>
          direction *
          (new Date(a.plan.startsAt).getTime() - new Date(b.plan.startsAt).getTime()),
      );
    },

    async addBringItem(planId, item, key) {
      await call();
      requireHost(planId);
      const fingerprint = `bring_add:${planId}:${item.label.trim()}:${item.quantity}`;
      const replayed = replayKey(key, fingerprint);
      if (replayed) return replayed;
      const label = item.label.trim();
      if (Array.from(label).length < 1 || Array.from(label).length > 60) {
        throw new BackendError('invalid_input');
      }
      if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 20) {
        throw new BackendError('invalid_input');
      }
      requireLive(planId);
      const id = `bring-${Date.now()}-${key.slice(0, 8)}`;
      const created: FixtureBringItem = { id, planId, label, quantity: item.quantity, claimedBy: [] };
      commit({
        ...state,
        bringCreated: [...state.bringCreated, created],
        idempotent: { ...state.idempotent, [key]: { fingerprint, id } },
      });
      return id;
    },

    async updateBringItem(itemId, item, key) {
      await call();
      const existing = state.bringCreated.find((b) => b.id === itemId);
      if (!existing) throw new BackendError('not_found');
      requireHost(existing.planId);
      const fingerprint = `bring_update:${itemId}:${item.label.trim()}:${item.quantity}`;
      if (replayKey(key, fingerprint)) return;
      const label = item.label.trim();
      if (Array.from(label).length < 1 || Array.from(label).length > 60) {
        throw new BackendError('invalid_input');
      }
      if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 20) {
        throw new BackendError('invalid_input');
      }
      requireLive(existing.planId);
      if (item.quantity < existing.claimedBy.length) throw new BackendError('invalid_input');
      commit({
        ...state,
        bringCreated: state.bringCreated.map((b) =>
          b.id === itemId ? { ...b, label, quantity: item.quantity } : b,
        ),
        idempotent: { ...state.idempotent, [key]: { fingerprint, id: itemId } },
      });
    },

    async removeBringItem(itemId, key) {
      await call();
      requireSession();
      // A retry of a removal that already happened replays it, even though the item is gone.
      const fingerprint = `bring_remove:${itemId}`;
      if (replayKey(key, fingerprint)) return;
      const existing = state.bringCreated.find((b) => b.id === itemId);
      if (!existing) throw new BackendError('not_found');
      requireHost(existing.planId);
      requireLive(existing.planId);
      if (existing.claimedBy.length > 0) throw new BackendError('item_claimed');
      commit({
        ...state,
        bringCreated: state.bringCreated.filter((b) => b.id !== itemId),
        idempotent: { ...state.idempotent, [key]: { fingerprint, id: itemId } },
      });
    },

    async unclaimBringItem(itemId, key) {
      await call();
      requireSession();
      const fingerprint = `slot_unclaim:${itemId}`;
      if (replayKey(key, fingerprint)) return;
      const item =
        fixtureBringItems.find((candidate) => candidate.id === itemId) ??
        state.bringCreated.find((candidate) => candidate.id === itemId);
      if (!item) throw new BackendError('not_found');
      requireLive(item.planId);
      commit({
        ...state,
        claimedItemIds: state.claimedItemIds.filter((id) => id !== itemId),
        idempotent: { ...state.idempotent, [key]: { fingerprint, id: itemId } },
      });
    },

    async claimBringItem(itemId, key) {
      await call('claimBringItem');
      requireSession();
      const item =
        fixtureBringItems.find((candidate) => candidate.id === itemId) ??
        state.bringCreated.find((candidate) => candidate.id === itemId);
      if (!item) throw new BackendError('not_found');
      if (replayed(key) || state.claimedItemIds.includes(itemId)) return;
      if (!state.goingPlanIds.includes(item.planId)) throw new BackendError('rsvp_required');
      if (item.claimedBy.length >= item.quantity) throw new BackendError('item_taken');
      commit({ ...state, claimedItemIds: [...state.claimedItemIds, itemId] });
    },
  };
}

import { appStorage } from '../../storage';
import { BackendError, type Backend } from '../backend';
import { DEFAULT_SETTINGS, isRecipeAllergen, PROFILE_GOALS } from '../types';
import type {
  AppNotification,
  AuditRow,
  Circle,
  City,
  CircleRequest,
  FeedbackState,
  GroupOrder,
  GuestState,
  HostSummary,
  MyPlan,
  OrderItem,
  Plan,
  Profile,
  Person,
  Recipe,
  RecipeDetail,
  ReportReceipt,
  Session,
  StaffAppeal,
  StaffCase,
  PendingPolicy,
  Suspension,
  UserSettings,
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
  /** Cities typed in that the seed does not have (mirrors city_ensure). */
  citiesAdded: City[];
  /** The private details of Plans this person published: the host always sees them. */
  /** Group orders published in this session, with items and everyone's interest. */
  orders: Record<
    string,
    GroupOrder & {
      pickupAddressValue: string;
      interests: Record<string, Record<string, number>>;
      collectedBy: string[];
    }
  >;
  plansSecrets: Record<string, { address: string | null; meetingUrl: string | null }>;
  /** Guests on the Plans this person hosts. Seeded on publish, like the sample requests. */
  plansGuests: Record<
    string,
    { userId: string; displayName: string; state: GuestState; checkedInAt: string | null }[]
  >;
  /** Plans the host has ended in this session. */
  plansEnded: string[];
  /** Bring items the host added or changed in this session (the sample items are read-only). */
  bringCreated: FixtureBringItem[];
  /** Group chat messages by conversation id; a client id makes a send idempotent. */
  /** Direct conversations open with these people (their ids). */
  directOpen: string[];
  /** First-message requests: incoming ones from people in the viewer's Circles, and the viewer's own. */
  directIncoming: {
    id: string;
    fromId: string;
    fromName: string;
    firstMessage: string;
    createdAt: string;
    status: 'pending' | 'accepted' | 'declined';
  }[];
  /** The viewer's requests, by recipient: the first message and when it was sent. */
  directOutgoing: Record<string, { firstMessage: string; createdAt: string; clientId: string }>;
  /** Mute and pin per conversation, for this person. */
  /** People the viewer has blocked: hidden from People, chats and requests both ways. */
  blocked: string[];
  /** Reports made in this session, as the staff console (dev) lists them. */
  reports: (StaffCase & { targetUserId: string | null })[];
  /** The viewer's own suspension, set by a staff decision in this session (dev only). */
  suspension: Suspension | null;
  appeals: StaffAppeal[];
  audit: AuditRow[];
  /** Privacy choices and notification settings; null until first read. */
  settings: UserSettings | null;
  /** Policy versions published in this session (dev hook) and not yet accepted. */
  policiesPending: PendingPolicy[];
  /** In-app notification rows, newest first. */
  notifications: AppNotification[];
  /** Guests from shared links, by cancel token (web RSVP). */
  webGuests: Record<
    string,
    {
      planId: string;
      firstName: string;
      email: string;
      status: 'going' | 'waitlisted' | 'cancelled';
      position: number | null;
    }
  >;
  pushTokens: string[];
  conversationSettings: Record<
    string,
    { mutedUntil: string | null; pinned: boolean; lastReadAt?: string | null }
  >;
  messages: Record<
    string,
    {
      id: string;
      clientId: string;
      senderId: string;
      senderName: string;
      body: string;
      createdAt: string;
    }[]
  >;
  /** The viewer's feedback on Plans, by Plan id. */
  feedbackMine: Record<string, { rating: number; comment: string | null }>;
  /** Keyed creations, so a retry replays the same result as the database does. */
  idempotent: Record<string, { fingerprint: string; id: string }>;
}

type Operation =
  | 'listPlans'
  | 'listMyPlans'
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
    /** Test hook: a staff decision pauses the viewer's account, as the Suspended screen shows it. */
    suspend: () => void;
    /** Test hook: the viewer becomes staff, so the web console opens. */
    makeStaff: () => void;
    /** Test hook: a new Terms version takes effect now, so the update gate shows. */
    publishTerms: () => void;
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
  citiesAdded: [],
  plansSecrets: {},
  orders: {},
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
  blocked: [],
  reports: [],
  suspension: null,
  appeals: [],
  audit: [],
  settings: null,
  policiesPending: [],
  notifications: [],
  pushTokens: [],
  webGuests: {},
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
    suspend: () => {
      const until = new Date(Date.now() + 9 * 86_400_000).toISOString();
      commit({
        ...state,
        suspension: {
          actionId: 'action-dev-suspend',
          action: 'suspend',
          reason: 'Repeated messages after a member declined contact',
          rule: 'Community Rules §3 — no unwanted contact',
          until,
          automated: false,
          decidedAt: new Date().toISOString(),
          appealStatus: null,
        },
      });
    },
    makeStaff: () => {
      commit({
        ...state,
        profile: state.profile ? { ...state.profile, role: 'staff' } : state.profile,
      });
    },
    publishTerms: () => {
      if (state.policiesPending.some((p) => p.version === '2026-12')) return;
      commit({
        ...state,
        policiesPending: [
          {
            policy: 'terms',
            version: '2026-12',
            effectiveAt: new Date().toISOString(),
            required: true,
            blocking: true,
            summary: [
              { title: 'Paid workshops', note: 'How booking, refunds and payouts work' },
              { title: 'AI features', note: 'Which tools use AI and how they’re labelled' },
              { title: 'Reports and appeals', note: 'How we decide and how to challenge it' },
            ],
            url: 'https://plantcircle.app/legal/terms',
            acceptedVersion: '2026-11',
          },
        ],
      });
    },
    freeSpot: (planId, offerMs = OFFER_MS) => {
      const inLine = planId in state.waitlist;
      commit({
        ...state,
        notifications: inLine
          ? notifyMe('waitlist_offer', {
              plan_id: planId,
              plan: plans().find((p) => p.id === planId)?.title ?? planId,
            })
          : state.notifications,
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

  /** Seed cities plus the ones typed in, for every lookup by id. */
  const allCities = (): City[] => [...fixtureCities, ...state.citiesAdded];

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

  /** The profile as the database reports it: paused while a suspension stands. */
  function withStanding(profile: Profile | null): Profile | null {
    if (!profile) return null;
    const s = state.suspension;
    const standing = s !== null && (s.until === null || Date.parse(s.until) > Date.now());
    if (!standing) return profile;
    return s.action === 'freeze_messages'
      ? { ...profile, messagesFrozenUntil: s.until }
      : { ...profile, status: 'suspended', suspendedUntil: s.until };
  }

  /** A paused account reads but cannot post, join or message, as the database trigger refuses. */
  function requireActive(): void {
    requireSession();
    const p = withStanding(state.profile);
    if (
      p &&
      p.status === 'suspended' &&
      (p.suspendedUntil === null || Date.parse(p.suspendedUntil) > Date.now())
    ) {
      throw new BackendError('suspended');
    }
  }

  /** A frozen member cannot post messages, as the database trigger refuses. */
  function requireNotFrozen(): void {
    const p = withStanding(state.profile);
    if (p?.messagesFrozenUntil && Date.parse(p.messagesFrozenUntil) > Date.now()) {
      throw new BackendError('messages_frozen');
    }
  }

  /** Contact with a blocked person is refused, as the database trigger refuses it. */
  function requireNotBlocked(userId: string): void {
    if (state.blocked.includes(userId)) throw new BackendError('blocked');
  }

  function requireStaff(): void {
    requireActive();
    if (state.profile?.role !== 'staff') throw new BackendError('forbidden');
  }

  function auditRow(action: string, targetType: string, reason: string): AuditRow {
    return {
      id: `audit-${Date.now()}-${state.audit.length}`,
      actorName: myName(),
      actorRole: 'staff',
      action,
      targetType,
      reason,
      createdAt: new Date().toISOString(),
    };
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
    text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().split(/\s+/).filter(Boolean);

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
      const me = state.session?.userId ?? 'fixture-you';
      const interested = Object.values(state.orders[refId]?.interests ?? {}).some(
        (byUser) => (byUser[me] ?? 0) > 0,
      );
      return hosted || interested || state.goingPlanIds.includes(refId);
    }
    return (
      state.circlesJoined.includes(refId) || state.circlesCreated.some((c) => c.id === refId)
    );
  }

  /** A collecting order past its close resolves itself, as the database does. */
  function effectiveOrderState(entry: (typeof state.orders)[string]): GroupOrder['state'] {
    if (
      ['collecting', 'extended'].includes(entry.state) &&
      Date.now() >= Date.parse(entry.closesAt)
    ) {
      const total = Object.values(entry.interests).reduce(
        (a, byUser) => a + Object.values(byUser).reduce((x, y) => x + y, 0),
        0,
      );
      return total >= entry.targetTotal ? 'locked' : 'below_target';
    }
    return entry.state;
  }

  /** The order as the viewer sees it: totals, their own amounts, and the address when allowed. */
  function orderView(entry: (typeof state.orders)[string]): GroupOrder {
    const me = state.session?.userId ?? null;
    const st = effectiveOrderState(entry);
    const items: OrderItem[] = entry.items.map((i) => ({
      id: i.id,
      name: i.name,
      unit: i.unit,
      target: i.target,
      estPriceMinor: i.estPriceMinor,
      currency: i.currency,
      interestTotal: Object.values(entry.interests[i.id] ?? {}).reduce((a, b) => a + b, 0),
      mine: me ? (entry.interests[i.id]?.[me] ?? 0) : 0,
    }));
    const hasInterest = items.some((i) => i.mine > 0);
    const people = new Set(
      Object.values(entry.interests).flatMap((byUser) =>
        Object.entries(byUser)
          .filter(([, q]) => q > 0)
          .map(([u]) => u),
      ),
    );
    const organizer = me !== null && entry.organizerId === me;
    // Built field by field: the stored entry holds the address and everyone's interest, which
    // must not leak into (or be changed through) the result.
    return {
      id: entry.id,
      title: entry.title,
      description: entry.description,
      organizerId: entry.organizerId,
      organizerName: entry.organizerName,
      supplierName: entry.supplierName,
      supplierArea: entry.supplierArea,
      closesAt: entry.closesAt,
      pickupStart: entry.pickupStart,
      pickupEnd: entry.pickupEnd,
      pickupNote: entry.pickupNote,
      timezone: entry.timezone,
      state: st,
      extendedOnce: entry.extendedOnce,
      targetTotal: entry.targetTotal,
      items,
      interestTotal: items.reduce((a, i) => a + i.interestTotal, 0),
      peopleCount: people.size,
      pickupAddress:
        organizer || (hasInterest && ['locked', 'ready', 'completed'].includes(st))
          ? entry.pickupAddressValue
          : null,
      collected: me !== null && entry.collectedBy.includes(me),
    };
  }

  /** An in-app row, as the database trigger writes one. */
  function notifyMe(type: string, payload: Record<string, unknown>): AppNotification[] {
    return [
      {
        id: `notif-${Date.now()}-${state.notifications.length}`,
        type,
        payload,
        readAt: null,
        createdAt: new Date().toISOString(),
      },
      ...state.notifications,
    ];
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
      .filter((p) => circleIds.has(p.circleId) && !state.blocked.includes(p.person.userId))
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
        ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
        : item,
    );

  /** A keyed creation seen before: the same input replays its result; different input is refused. */
  const replayKey = (key: string, fingerprint: string): string | null => {
    const seen = state.idempotent[key];
    if (!seen) return null;
    if (seen.fingerprint !== fingerprint)
      throw new BackendError('invalid_input', 'idempotency_key_reused');
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
      const guests = Object.values(state.webGuests).filter(
        (g) => g.planId === plan.id && g.status === 'going',
      ).length;
      const going =
        plan.goingCount - freed + guests + (state.goingPlanIds.includes(plan.id) ? 1 : 0);
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
      // The dev person's privacy choices and settings survive a sign-out, as the database's do.
      commit({ ...EMPTY, settings: state.settings }, true);
    },

    async getProfile() {
      await call();
      requireSession();
      return withStanding(state.profile);
    },

    async createProfile(input) {
      await call();
      requireSession();
      const profile = {
        displayName: input.displayName,
        cityId: input.cityId,
        goals: input.goals,
        peopleVisible: false,
        status: 'active' as const,
        suspendedUntil: null,
        messagesFrozenUntil: null,
        role: 'member' as const,
      };
      commit({ ...state, profile });
      return withStanding(profile) ?? profile;
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
      requireActive();
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
      requireActive();
      const fingerprint = fingerprintOf(input);
      const replayed = replayKey(key, fingerprint);
      if (replayed) return replayed;
      const now = Date.now();
      const recent = state.circlesCreatedAt.filter(
        (at) => now - new Date(at).getTime() < 86_400_000,
      );
      if (recent.length >= 3) throw new BackendError('rate_limited');
      const city = allCities().find((c) => c.id === input.cityId);
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
        ownerName: myName(),
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
      requireActive();
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
          const haystack = normalizeWords(
            `${r.title} ${r.cuisine ?? ''} ${r.intro ?? ''}`,
          ).join(' ');
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
      requireActive();
      const fingerprint = fingerprintOf(input);
      const replayed = replayKey(key, fingerprint);
      if (replayed) return replayed;
      const inCircle = [
        ...state.circlesJoined,
        ...state.circlesCreated.map((c) => c.id),
      ].includes(input.circleId);
      if (!inCircle) throw new BackendError('not_found');
      if (input.allergensConfirmed && input.allergens.length === 0) {
        throw new BackendError('invalid_input');
      }
      if (input.ingredients.length === 0 || input.steps.length === 0) {
        throw new BackendError('invalid_input');
      }
      const circleName =
        [...fixtureCircles, ...state.circlesCreated].find((c) => c.id === input.circleId)
          ?.name ?? '';
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
      requireActive();
      const fingerprint = fingerprintOf(input);
      const replayed = replayKey(key, fingerprint);
      if (replayed) return replayed;
      const city = allCities().find((c) => c.id === state.profile?.cityId);
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
          ? Array.from(link).length > 500 ||
            !/^https:\/\/[^\s/?#@:]+\.[^\s/?#@:]+([/?#]\S*)?$/.test(link)
          : Array.from(area).length < 1 ||
            Array.from(area).length > 60 ||
            Array.from(address).length < 1 ||
            Array.from(address).length > 200);
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
            {
              userId: 'fixture-mia-k',
              displayName: 'Mia K.',
              state: 'going',
              checkedInAt: null,
            },
            {
              userId: 'fixture-jonas-k',
              displayName: 'Jonas K.',
              state: 'waitlisted',
              checkedInAt: null,
            },
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
      requireActive();
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
      requireActive();
      requireHost(planId);
      const fingerprint = `host_end_plan:${planId}`;
      if (replayKey(key, fingerprint)) return;
      const plan = findPlan(planId);
      if (Date.now() < new Date(plan.startsAt).getTime())
        throw new BackendError('plan_not_started');
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
      const eligible =
        me?.state === 'checked_in' && Date.now() >= new Date(plan.endsAt).getTime();
      const mine = state.feedbackMine[planId];
      return {
        eligible,
        rating: mine?.rating ?? null,
        comment: mine?.comment ?? null,
      } satisfies FeedbackState;
    },

    async submitFeedback(planId, rating, comment, key) {
      await call();
      requireActive();
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
      if (kind === 'direct' && state.blocked.includes(refId))
        throw new BackendError('closed_chat');
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
      requireActive();
      const { kind, refId } = conversationRef(conversationId);
      if (kind === 'direct') requireNotBlocked(refId);
      if (!chatMember(kind, refId)) {
        throw new BackendError('closed_chat');
      }
      const me = state.session?.userId ?? 'fixture-you';
      const existing = state.messages[conversationId] ?? [];
      // Like the database: a client id is unique per sender across every conversation.
      const everything = Object.values(state.messages).flat();
      if (everything.some((m) => m.clientId === clientId && m.senderId === me)) return;
      requireNotFrozen();
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
      requireActive();
      requireNotBlocked(userId);
      if (state.directOpen.includes(userId)) {
        return { status: 'accepted', conversationId: `conv-direct-${userId}` };
      }
      requireNotFrozen();
      // A request already made reads as pending, whatever the recipient decided (a decline is silent).
      // A retry with the same client id, or any request already made, reads as pending.
      if (state.directOutgoing[userId]) return { status: 'pending' };
      if (!visiblePeople().some((p) => p.userId === userId))
        throw new BackendError('person_not_found');
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
      requireActive();
      const request = state.directIncoming.find((r) => r.id === requestId);
      if (!request) throw new BackendError('not_found');
      if (request.status !== 'pending')
        return request.status === 'accepted' ? 'accepted' : 'declined';
      const conversationId = `conv-direct-${request.fromId}`;
      const status: 'accepted' | 'declined' = accept ? 'accepted' : 'declined';
      commit({
        ...state,
        directIncoming: state.directIncoming.map((r) =>
          r.id === requestId ? { ...r, status } : r,
        ),
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
      requireActive();
      const { kind, refId } = conversationRef(conversationId);
      if (!chatMember(kind, refId)) throw new BackendError('closed_chat');
      if (kind === 'direct' && state.blocked.includes(refId))
        throw new BackendError('closed_chat');
      const current = state.conversationSettings[conversationId] ?? {
        mutedUntil: null,
        pinned: false,
      };
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
      requireActive();
      const { kind, refId } = conversationRef(conversationId);
      if (!chatMember(kind, refId)) throw new BackendError('closed_chat');
      const current = state.conversationSettings[conversationId] ?? {
        mutedUntil: null,
        pinned: false,
      };
      commit({
        ...state,
        conversationSettings: {
          ...state.conversationSettings,
          [conversationId]: { ...current, pinned },
        },
      });
    },

    async listInbox() {
      await call();
      requireSession();
      const me = state.session?.userId ?? 'fixture-you';
      const places: { kind: 'plan' | 'circle' | 'direct'; refId: string; title: string }[] = [
        ...plans()
          .filter(
            (p) =>
              state.goingPlanIds.includes(p.id) ||
              state.plansCreated.some((c) => c.id === p.id),
          )
          .map((p) => ({ kind: 'plan' as const, refId: p.id, title: p.title })),
        ...[...fixtureCircles, ...state.circlesCreated]
          .filter(
            (c) =>
              state.circlesJoined.includes(c.id) ||
              state.circlesCreated.some((x) => x.id === c.id),
          )
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
        const readAt = settings?.lastReadAt
          ? new Date(settings.lastReadAt).getTime()
          : -Infinity;
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
          muted: settings?.mutedUntil
            ? new Date(settings.mutedUntil).getTime() > Date.now()
            : false,
          imagePath:
            place.kind === 'plan'
              ? (plans().find((p) => p.id === place.refId)?.imagePath ?? null)
              : null,
        };
      });
      return threads.sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return (b.lastAt ?? '').localeCompare(a.lastAt ?? '') || a.title.localeCompare(b.title);
      });
    },

    async markConversationRead(conversationId, upTo) {
      await call();
      requireActive();
      const { kind, refId } = conversationRef(conversationId);
      if (!chatMember(kind, refId)) throw new BackendError('closed_chat');
      const current = state.conversationSettings[conversationId] ?? {
        mutedUntil: null,
        pinned: false,
      };
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

    async getOrder(planId) {
      await call();
      const stored = state.orders[planId];
      if (!stored) throw new BackendError('not_found');
      return orderView(stored);
    },

    async createOrder(input, key) {
      await call();
      requireActive();
      const fingerprint = fingerprintOf(input);
      const replayed = replayKey(key, fingerprint);
      if (replayed) return replayed;
      const city = allCities().find((c) => c.id === state.profile?.cityId);
      if (!city) throw new BackendError('city_required');
      const closes = Date.parse(input.closesAt);
      const ps = Date.parse(input.pickupStart);
      const pe = Date.parse(input.pickupEnd);
      const length = (v: string) => Array.from(v.trim()).length;
      // The same rules as order_create in the database.
      if (
        length(input.title) < 3 ||
        length(input.title) > 80 ||
        length(input.supplierName) < 1 ||
        length(input.supplierName) > 80 ||
        (input.supplierArea !== null && length(input.supplierArea) > 80) ||
        length(input.pickupAddress) < 1 ||
        length(input.pickupAddress) > 200 ||
        (input.pickupNote !== null && length(input.pickupNote) > 200) ||
        !Number.isFinite(closes) ||
        !Number.isFinite(ps) ||
        !Number.isFinite(pe) ||
        closes <= Date.now() + 3_600_000 ||
        ps < closes ||
        pe <= ps ||
        pe - ps > 12 * 3_600_000 ||
        input.items.length === 0 ||
        input.items.length > 20 ||
        input.items.some(
          (i) =>
            length(i.name) < 1 ||
            length(i.name) > 80 ||
            !Number.isFinite(i.target) ||
            i.target <= 0 ||
            (i.estPriceMinor !== null &&
              (!Number.isInteger(i.estPriceMinor) || i.estPriceMinor < 0)),
        )
      ) {
        throw new BackendError('invalid_input');
      }
      const id = `order-${Date.now()}-${key.slice(0, 8)}`;
      const me = state.session?.userId ?? 'fixture-you';
      const items = input.items.map((i, index) => ({
        id: `${id}-item-${index}`,
        name: i.name.trim(),
        unit: i.unit,
        target: i.target,
        estPriceMinor: i.estPriceMinor,
        currency: 'EUR',
        interestTotal: 0,
        mine: 0,
      }));
      const plan: Plan = {
        id,
        title: input.title.trim(),
        category: 'group_order',
        format: 'in_person',
        cityId: city.id,
        city: city.name,
        areaName: input.supplierArea?.trim() || city.name,
        venueName: null,
        areaHint: null,
        startsAt: input.pickupStart,
        endsAt: input.pickupEnd,
        revealAt: input.closesAt,
        timezone: city.timezone,
        capacity: 500,
        priceCents: 0,
        currency: 'EUR',
        description: input.description.trim(),
        allergens: 'none',
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
        orders: {
          ...state.orders,
          [id]: {
            id,
            title: plan.title,
            description: plan.description,
            organizerId: me,
            organizerName: myName(),
            supplierName: input.supplierName.trim(),
            supplierArea: input.supplierArea?.trim() || null,
            closesAt: input.closesAt,
            pickupStart: input.pickupStart,
            pickupEnd: input.pickupEnd,
            pickupNote: input.pickupNote?.trim() || null,
            timezone: city.timezone,
            pickupAddress: null,
            pickupAddressValue: input.pickupAddress.trim(),
            state: 'collecting',
            extendedOnce: false,
            targetTotal: items.reduce((a, i) => a + i.target, 0),
            interestTotal: 0,
            peopleCount: 0,
            items,
            collected: false,
            interests: {},
            collectedBy: [],
          },
        },
        idempotent: { ...state.idempotent, [key]: { fingerprint, id } },
      });
      return id;
    },

    async setOrderInterest(itemId, quantity, key) {
      await call();
      requireActive();
      const fingerprint = `order_interest:${itemId}:${quantity}`;
      if (replayKey(key, fingerprint)) return;
      const entry = Object.values(state.orders).find((o) =>
        o.items.some((i) => i.id === itemId),
      );
      if (!entry) throw new BackendError('not_found');
      if (!['collecting', 'extended'].includes(effectiveOrderState(entry))) {
        throw new BackendError('interest_closed');
      }
      if (!Number.isFinite(quantity) || quantity < 0 || quantity > 1000)
        throw new BackendError('invalid_input');
      const me = state.session?.userId ?? 'fixture-you';
      const interests = {
        ...entry.interests,
        [itemId]: { ...(entry.interests[itemId] ?? {}), [me]: quantity },
      };
      commit({
        ...state,
        orders: { ...state.orders, [entry.id]: { ...entry, interests } },
        idempotent: { ...state.idempotent, [key]: { fingerprint, id: itemId } },
      });
    },

    async decideOrder(planId, decision, key) {
      await call();
      requireActive();
      const fingerprint = `order_decide:${planId}:${decision}`;
      const replayed = replayKey(key, fingerprint);
      if (replayed) return replayed as GroupOrder['state'];
      const entry = state.orders[planId];
      if (!entry) throw new BackendError('not_found');
      if (entry.organizerId !== (state.session?.userId ?? 'fixture-you'))
        throw new BackendError('forbidden');
      const current = effectiveOrderState(entry);
      let next: GroupOrder['state'];
      let patch: Partial<typeof entry> = {};
      if (decision === 'cancel' && !['completed', 'cancelled'].includes(current))
        next = 'cancelled';
      else if (decision === 'go' && ['below_target', 'locked'].includes(current)) {
        const anyone = Object.values(entry.interests).some((byUser) =>
          Object.values(byUser).some((q) => q > 0),
        );
        if (!anyone) throw new BackendError('order_not_open');
        next = 'locked';
      } else if (decision === 'extend' && current === 'below_target' && !entry.extendedOnce) {
        next = 'extended';
        const closes = Date.now() + 72 * 3_600_000;
        const start = Math.max(Date.parse(entry.pickupStart), closes);
        const windowLength = Date.parse(entry.pickupEnd) - Date.parse(entry.pickupStart);
        patch = {
          extendedOnce: true,
          closesAt: new Date(closes).toISOString(),
          pickupStart: new Date(start).toISOString(),
          pickupEnd: new Date(start + windowLength).toISOString(),
        };
      } else if (decision === 'ready' && current === 'locked') next = 'ready';
      else throw new BackendError('order_not_open');
      commit({
        ...state,
        plansCreated: state.plansCreated.map((p) =>
          p.id === planId && patch.pickupStart && patch.pickupEnd && patch.closesAt
            ? {
                ...p,
                startsAt: patch.pickupStart,
                endsAt: patch.pickupEnd,
                revealAt: patch.closesAt,
              }
            : p,
        ),
        orders: { ...state.orders, [planId]: { ...entry, ...patch, state: next } },
        idempotent: { ...state.idempotent, [key]: { fingerprint, id: next } },
      });
      return next;
    },

    async markOrderCollected(planId, key) {
      await call();
      requireActive();
      const fingerprint = `order_collected:${planId}`;
      if (replayKey(key, fingerprint)) return;
      const entry = state.orders[planId];
      if (!entry) throw new BackendError('not_found');
      if (entry.state !== 'ready') throw new BackendError('order_not_open');
      const me = state.session?.userId ?? 'fixture-you';
      const mine = Object.values(entry.interests).some((byUser) => (byUser[me] ?? 0) > 0);
      if (!mine) throw new BackendError('rsvp_required');
      const collectedBy = [...new Set([...entry.collectedBy, me])];
      const everyone = new Set(
        Object.values(entry.interests).flatMap((byUser) =>
          Object.entries(byUser)
            .filter(([, q]) => q > 0)
            .map(([u]) => u),
        ),
      );
      const done = [...everyone].every((u) => collectedBy.includes(u));
      commit({
        ...state,
        orders: {
          ...state.orders,
          [planId]: { ...entry, collectedBy, state: done ? 'completed' : entry.state },
        },
        idempotent: { ...state.idempotent, [key]: { fingerprint, id: planId } },
      });
    },

    async webRsvp(planId, input, key) {
      await call('joinPlan');
      const fingerprint = fingerprintOf({ planId, ...input });
      const replayed = replayKey(key, fingerprint);
      if (replayed) {
        const earlier = state.webGuests[replayed];
        if (!earlier)
          return { status: 'existing', position: null, cancelToken: null, emailSent: true };
        return {
          status: earlier.status === 'cancelled' ? 'going' : earlier.status,
          position: earlier.position,
          cancelToken: replayed,
          emailSent: true,
        };
      }
      const email = input.email.trim().toLowerCase();
      const firstName = input.firstName.trim();
      if (!input.ageConfirmed) throw new BackendError('age_required');
      if (
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
        Array.from(firstName).length < 1 ||
        Array.from(firstName).length > 40
      ) {
        throw new BackendError('invalid_input');
      }
      const plan = findPlan(planId);
      // The dev member's own address, or one used before, already belongs to a member.
      if (
        email === 'lena@example.com' ||
        Object.values(state.webGuests).some((g) => g.email === email)
      ) {
        commit({
          ...state,
          idempotent: { ...state.idempotent, [key]: { fingerprint, id: 'existing' } },
        });
        return { status: 'existing', position: null, cancelToken: null, emailSent: true };
      }
      const status = plan.hasOpenSpot ? 'going' : 'waitlisted';
      const position = status === 'waitlisted' ? plan.waitlistCount + 1 : null;
      const token = `guest-${Date.now()}-${key.slice(0, 8)}`;
      commit({
        ...state,
        webGuests: {
          ...state.webGuests,
          [token]: { planId, firstName, email, status, position },
        },
        idempotent: { ...state.idempotent, [key]: { fingerprint, id: token } },
      });
      return { status, position, cancelToken: token, emailSent: true };
    },

    async webRsvpCancel(cancelToken, key) {
      await call('cancelRsvp');
      if (replayKey(key, `web_cancel:${cancelToken}`)) return;
      const guest = state.webGuests[cancelToken];
      if (!guest) throw new BackendError('not_found');
      commit({
        ...state,
        webGuests: { ...state.webGuests, [cancelToken]: { ...guest, status: 'cancelled' } },
        idempotent: {
          ...state.idempotent,
          [key]: { fingerprint: `web_cancel:${cancelToken}`, id: cancelToken },
        },
      });
    },

    async listNotifications() {
      await call();
      requireSession();
      return state.notifications;
    },

    async markNotificationRead(id) {
      await call();
      requireSession();
      commit({
        ...state,
        notifications: state.notifications.map((n) =>
          n.id === id && !n.readAt ? { ...n, readAt: new Date().toISOString() } : n,
        ),
      });
    },

    async markAllNotificationsRead() {
      await call();
      requireSession();
      const at = new Date().toISOString();
      commit({
        ...state,
        notifications: state.notifications.map((n) => (n.readAt ? n : { ...n, readAt: at })),
      });
    },

    async registerPushToken(token) {
      await call();
      requireSession();
      if (!state.pushTokens.includes(token))
        commit({ ...state, pushTokens: [...state.pushTokens, token] });
    },

    async removePushToken(token) {
      await call();
      requireSession();
      commit({ ...state, pushTokens: state.pushTokens.filter((t) => t !== token) });
    },

    async getPendingPolicies() {
      await call();
      requireSession();
      return state.policiesPending;
    },

    async acceptPolicies(versions) {
      await call();
      requireSession();
      const accepted = state.policiesPending.filter((p) =>
        versions.some((v) => v.policy === p.policy && v.version === p.version),
      );
      commit({
        ...state,
        policiesPending: state.policiesPending.filter((p) => !accepted.includes(p)),
      });
      return accepted.length;
    },

    async getSettings() {
      await call();
      requireSession();
      const current = state.settings ?? DEFAULT_SETTINGS;
      if (!state.settings) commit({ ...state, settings: current });
      return current;
    },

    async updateSettings(patch) {
      await call();
      requireSession();
      const current = state.settings ?? DEFAULT_SETTINGS;
      const { notifPromptDismissed, ...rest } = patch;
      const decided = 'analyticsConsent' in rest || 'personalisationConsent' in rest;
      const next: UserSettings = {
        ...current,
        ...rest,
        consentDecidedAt: decided ? new Date().toISOString() : current.consentDecidedAt,
        notifPromptDismissedAt: notifPromptDismissed
          ? new Date().toISOString()
          : current.notifPromptDismissedAt,
      };
      if (
        next.quietStart < 0 ||
        next.quietStart > 23 ||
        next.quietEnd < 0 ||
        next.quietEnd > 23
      ) {
        throw new BackendError('invalid_input');
      }
      commit({ ...state, settings: next });
      return next;
    },

    async requestDataExport(key) {
      await call();
      requireSession();
      const fingerprint = 'data_export';
      const replayed = replayKey(key, fingerprint);
      const current = state.settings ?? DEFAULT_SETTINGS;
      if (replayed) return replayed;
      const at = current.exportRequestedAt ?? new Date().toISOString();
      commit({
        ...state,
        settings: { ...current, exportRequestedAt: at },
        idempotent: { ...state.idempotent, [key]: { fingerprint, id: at } },
      });
      return at;
    },

    async deleteAccount(key) {
      await call();
      requireSession();
      if (replayKey(key, 'account_delete')) return;
      // Everything of this person's goes; the dev session ends with it, like a sign-out.
      commit(EMPTY, true);
    },

    async blockUser(userId, key) {
      await call();
      requireSession();
      const fingerprint = `block:${userId}`;
      if (replayKey(key, fingerprint)) return;
      const me = state.session?.userId ?? 'fixture-you';
      if (userId === me) throw new BackendError('person_not_found');
      // Pending contact both ways ends; the other side is told nothing.
      const outgoing = Object.fromEntries(
        Object.entries(state.directOutgoing).filter(([id]) => id !== userId),
      );
      commit({
        ...state,
        blocked: state.blocked.includes(userId) ? state.blocked : [...state.blocked, userId],
        peopleRequested: state.peopleRequested.filter((id) => id !== userId),
        directOutgoing: outgoing,
        directIncoming: state.directIncoming.map((r) =>
          r.fromId === userId && r.status === 'pending'
            ? { ...r, status: 'declined' as const }
            : r,
        ),
        idempotent: { ...state.idempotent, [key]: { fingerprint, id: userId } },
      });
    },

    async unblockUser(userId) {
      await call();
      requireSession();
      commit({ ...state, blocked: state.blocked.filter((id) => id !== userId) });
    },

    async listBlocked() {
      await call();
      requireSession();
      return state.blocked.map((userId) => ({
        userId,
        displayName:
          fixturePeople.find((p) => p.person.userId === userId)?.person.displayName ??
          state.directIncoming.find((r) => r.fromId === userId)?.fromName ??
          userId,
        createdAt: new Date().toISOString(),
      }));
    },

    async createReport(input, key) {
      await call();
      requireSession();
      const fingerprint = fingerprintOf(input);
      const replayed = replayKey(key, fingerprint);
      if (replayed) {
        const earlier = state.reports.find((r) => r.caseRef === replayed);
        if (!earlier) throw new BackendError('not_found');
        return { caseRef: earlier.caseRef, severity: earlier.severity };
      }
      const details = input.details.trim();
      if (
        !input.accuracyConfirmed ||
        Array.from(details).length < 1 ||
        Array.from(details).length > 2000
      ) {
        throw new BackendError('invalid_input');
      }
      const severity: ReportReceipt['severity'] =
        input.category === 'threats' || input.category === 'stalking'
          ? 'urgent'
          : ['harassment', 'scam', 'unsafe_place', 'allergen_deception'].includes(
                input.category,
              )
            ? 'high'
            : 'routine';
      const caseRef = `PC-${3100 + state.reports.length + 1}`;
      const receipt: ReportReceipt = { caseRef, severity };
      const label =
        input.targetType === 'person'
          ? (fixturePeople.find((p) => p.person.userId === input.targetId)?.person
              .displayName ?? input.targetId)
          : input.targetType === 'plan' || input.targetType === 'order'
            ? (plans().find((candidate) => candidate.id === input.targetId)?.title ??
              input.targetId)
            : input.targetId;
      const hours = severity === 'urgent' ? 1 : severity === 'high' ? 24 : 72;
      commit({
        ...state,
        reports: [
          {
            id: `report-${caseRef}`,
            caseRef,
            targetType: input.targetType,
            targetId: input.targetId,
            targetLabel: label,
            targetUserId: input.targetType === 'person' ? input.targetId : null,
            targetUserName: input.targetType === 'person' ? label : null,
            category: input.category,
            severity,
            status: 'open',
            details,
            slaDueAt: new Date(Date.now() + hours * 3_600_000).toISOString(),
            createdAt: new Date().toISOString(),
            evidenceCount: 0,
            history: [],
            actions: [],
            appeal: null,
          },
          ...state.reports,
        ],
        idempotent: { ...state.idempotent, [key]: { fingerprint, id: caseRef } },
      });
      return receipt;
    },

    async getSuspension() {
      await call();
      requireSession();
      const s = state.suspension;
      if (!s || (s.until !== null && Date.parse(s.until) <= Date.now())) return null;
      return s;
    },

    async createAppeal(actionId, statement, key) {
      await call();
      requireSession();
      const fingerprint = `appeal:${actionId}:${statement.trim()}`;
      if (replayKey(key, fingerprint)) return;
      if (!state.suspension || state.suspension.actionId !== actionId)
        throw new BackendError('not_found');
      if (state.suspension.appealStatus) throw new BackendError('invalid_input');
      const text = statement.trim();
      if (Array.from(text).length < 1 || Array.from(text).length > 2000)
        throw new BackendError('invalid_input');
      commit({
        ...state,
        suspension: { ...state.suspension, appealStatus: 'open' },
        appeals: [
          ...state.appeals,
          {
            id: `appeal-${actionId}`,
            caseRef: null,
            action: state.suspension.action,
            originalActorName: 'Dana',
            originalReason: state.suspension.reason,
            statement: text,
            memberName: myName(),
            createdAt: new Date().toISOString(),
          },
        ],
        idempotent: { ...state.idempotent, [key]: { fingerprint, id: actionId } },
      });
    },

    async staffQueue() {
      await call();
      requireStaff();
      const rank = { urgent: 0, high: 1, routine: 2 };
      return state.reports
        .filter((r) => ['open', 'triaged', 'appealed'].includes(r.status))
        .sort(
          (a, b) =>
            rank[a.severity] - rank[b.severity] || a.createdAt.localeCompare(b.createdAt),
        );
    },

    async staffCase(reportId) {
      await call();
      requireStaff();
      const found = state.reports.find((r) => r.id === reportId);
      if (!found) throw new BackendError('not_found');
      return found;
    },

    async staffViewMessages(reportId, reason) {
      await call();
      requireStaff();
      if (!reason.trim()) throw new BackendError('invalid_input');
      const found = state.reports.find((r) => r.id === reportId);
      if (!found || found.targetType !== 'message') throw new BackendError('not_found');
      const conversationId = Object.keys(state.messages).find((c) =>
        state.messages[c]?.some((m) => m.id === found.targetId),
      );
      commit({
        ...state,
        audit: [auditRow('staff.view_messages', 'report', reason.trim()), ...state.audit],
      });
      return conversationId ? [...(state.messages[conversationId] ?? [])].reverse() : [];
    },

    async staffDecide(input, key) {
      await call();
      requireStaff();
      const fingerprint = `staff_decide:${input.reportId}:${input.action}`;
      if (replayKey(key, fingerprint)) return;
      const found = state.reports.find((r) => r.id === input.reportId);
      if (!found) throw new BackendError('not_found');
      if (['actioned', 'dismissed', 'closed'].includes(found.status))
        throw new BackendError('invalid_input');
      const reason = input.reason.trim();
      if (!reason) throw new BackendError('invalid_input');
      if (
        input.action === 'suspend' &&
        (!input.until || Date.parse(input.until) <= Date.now())
      ) {
        throw new BackendError('invalid_input');
      }
      const actionId = `action-${found.caseRef}`;
      const status = input.action === 'no_action' ? 'dismissed' : 'actioned';
      // Dev only: a suspension in the fixture pauses the viewer's own account, so the Suspended
      // screen can be walked through on a device.
      const suspension: Suspension | null =
        input.action === 'suspend' ||
        input.action === 'ban' ||
        input.action === 'freeze_messages'
          ? {
              actionId,
              action: input.action,
              reason,
              rule: input.rule,
              until: input.action === 'ban' ? null : input.until,
              automated: false,
              decidedAt: new Date().toISOString(),
              appealStatus: null,
            }
          : state.suspension;
      commit({
        ...state,
        reports: state.reports.map((r) =>
          r.id === found.id
            ? {
                ...r,
                status,
                actions: [
                  ...r.actions,
                  {
                    id: actionId,
                    action: input.action,
                    reason,
                    until: input.until,
                    createdAt: new Date().toISOString(),
                  },
                ],
              }
            : r,
        ),
        suspension,
        audit: [auditRow(`staff.${input.action}`, 'report', reason), ...state.audit],
        idempotent: { ...state.idempotent, [key]: { fingerprint, id: actionId } },
      });
    },

    async staffAppeals() {
      await call();
      requireStaff();
      return state.appeals;
    },

    async staffAppealDecide(appealId, uphold, reason, key) {
      await call();
      requireStaff();
      const fingerprint = `staff_appeal:${appealId}:${uphold}`;
      if (replayKey(key, fingerprint)) return;
      if (!state.appeals.some((a) => a.id === appealId)) throw new BackendError('not_found');
      if (!reason.trim()) throw new BackendError('invalid_input');
      const lifted = !uphold;
      commit({
        ...state,
        appeals: state.appeals.filter((a) => a.id !== appealId),
        suspension: state.suspension
          ? lifted
            ? null
            : { ...state.suspension, appealStatus: 'upheld' }
          : null,
        audit: [
          auditRow(
            uphold ? 'staff.appeal_upheld' : 'staff.appeal_reversed',
            'appeal',
            reason.trim(),
          ),
          ...state.audit,
        ],
        idempotent: { ...state.idempotent, [key]: { fingerprint, id: appealId } },
      });
    },

    async staffAudit(limit) {
      await call();
      requireStaff();
      return state.audit.slice(0, limit);
    },

    async listPeople() {
      await call();
      requireSession();
      return visiblePeople();
    },

    async connectWithPerson(userId, key) {
      await call();
      requireActive();
      requireNotBlocked(userId);
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
      requireActive();
      if (!state.profile) throw new BackendError('not_found');
      commit({ ...state, profile: { ...state.profile, peopleVisible: visible } });
    },

    async getProfileStats() {
      await call();
      requireSession();
      return {
        plans: new Set([...state.goingPlanIds, ...state.plansCreated.map((p) => p.id)]).size,
        circles: new Set([...state.circlesJoined, ...state.circlesCreated.map((c) => c.id)])
          .size,
        connections: visiblePeople().filter((p) => p.connection === 'connected').length,
      };
    },

    async setCity(cityId) {
      await call();
      requireActive();
      if (!state.profile) throw new BackendError('not_found');
      commit({ ...state, profile: { ...state.profile, cityId } });
    },

    async updateProfile(input) {
      await call();
      requireActive();
      if (!state.profile) throw new BackendError('not_found');
      const displayName = input.displayName.trim();
      const goals = input.goals.filter((g) => (PROFILE_GOALS as readonly string[]).includes(g));
      if (
        Array.from(displayName).length < 1 ||
        Array.from(displayName).length > 40 ||
        goals.length > 8
      ) {
        throw new BackendError('invalid_input');
      }
      const profile = { ...state.profile, displayName, goals };
      commit({ ...state, profile });
      return withStanding(profile) ?? profile;
    },

    async listCities() {
      await call();
      return allCities();
    },

    async ensureCity(input) {
      await call();
      const name = input.name.trim();
      const countryCode = input.countryCode.trim().toUpperCase();
      if (
        Array.from(name).length < 1 ||
        Array.from(name).length > 80 ||
        !/^[A-Z]{2}$/.test(countryCode)
      ) {
        throw new BackendError('invalid_input');
      }
      const known = allCities().find(
        (city) =>
          city.countryCode === countryCode && city.name.toLowerCase() === name.toLowerCase(),
      );
      if (known) return known;
      const city: City = {
        id: `city-${String(state.citiesAdded.length + 1)}-${String(Date.now())}`,
        name,
        countryCode,
        timezone: input.timezone,
      };
      commit({ ...state, citiesAdded: [...state.citiesAdded, city] });
      return city;
    },

    async listUpcomingPlans({ cityIds, from, to, format }) {
      await call('listPlans');
      return plans(from)
        .filter(
          (plan) =>
            (!cityIds || cityIds.includes(plan.cityId)) &&
            new Date(plan.startsAt) < to &&
            (!format || plan.format === format),
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
        bringItems: [...fixtureBringItems, ...state.bringCreated]
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
      requireActive();
      if (replayed(key) || state.goingPlanIds.includes(planId)) return;
      const plan = findPlan(planId);
      if (!plan.hasOpenSpot) throw new BackendError('plan_full');
      commit({
        ...state,
        goingPlanIds: [...state.goingPlanIds, planId],
        notifications: notifyMe('rsvp_confirmed', { plan_id: planId, plan: plan.title }),
      });
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
      requireActive();
      findPlan(planId);
      if (replayed(key) || planId in state.waitlist || state.goingPlanIds.includes(planId))
        return;
      commit({ ...state, waitlist: { ...state.waitlist, [planId]: { expiresAt: null } } });
    },

    async confirmWaitlistOffer(planId, key) {
      await call('confirmOffer');
      requireActive();
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
      await call('listMyPlans');
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
      requireActive();
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
      const created: FixtureBringItem = {
        id,
        planId,
        label,
        quantity: item.quantity,
        claimedBy: [],
      };
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
      requireActive();
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
      requireActive();
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
      requireActive();
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
      requireActive();
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

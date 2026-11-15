import Constants from 'expo-constants';
import { randomUUID } from 'expo-crypto';
import { Platform } from 'react-native';
import { currentLanguage } from './i18n';
import { appStorage } from './storage';

/**
 * Product analytics (docs/superpowers/specs/2026-11-15-retention-invites-analytics-design.md §3).
 *
 * - Only for a signed-in member who said yes in Privacy choices. Before that, and for visitors,
 *   nothing is recorded or kept for later: events are dropped, not queued.
 * - Saying no stops it at once: the queue is emptied and the member's analytics id forgotten.
 * - The id is random, one per account on this device, never the account id, and new after a
 *   withdrawal or a different account signs in.
 * - Only the properties listed below, never free text, names, places or ids of things.
 * - PostHog's EU endpoint, with location lookup off. Nothing at all without a project key.
 */

/** Every event and the only properties it may carry. */
export interface AnalyticsEvents {
  app_opened: Record<string, never>;
  circle_joined: { access: 'open' | 'request' };
  circle_invite_shared: Record<string, never>;
  circle_invite_opened: Record<string, never>;
  challenge_viewed: { surface: 'home' | 'circle' };
  cook_shared: { challenge: boolean };
  cook_reacted: Record<string, never>;
  rsvp_joined: { state: 'going' | 'waitlisted' };
  plan_published: { format: 'in_person' | 'online' };
  notification_opened: { type: string };
}
export type AnalyticsEvent = keyof AnalyticsEvents;

const ENDPOINT = 'https://eu.i.posthog.com/batch/';
const FLUSH_MS = 10_000;
const MAX_QUEUE = 50;
const keyOf = (userId: string) => `pc.analytics.id.${userId}`;

interface Queued {
  event: string;
  properties: Record<string, unknown>;
  timestamp: string;
}

const state: {
  /** The member allowed (freshly confirmed by the server) and the project key is set. */
  enabled: boolean;
  userId: string | null;
  distinctId: string | null;
  queue: Queued[];
  timer: ReturnType<typeof setTimeout> | null;
  /** Bumped on every change, so a slow start-up can never switch on after a later "no". */
  generation: number;
  /** Visits noted while consent was still loading; run once it is confirmed, dropped if not. */
  waiting: (() => void)[];
} = {
  enabled: false,
  userId: null,
  distinctId: null,
  queue: [],
  timer: null,
  generation: 0,
  waiting: [],
};

function projectKey(): string | null {
  const raw: unknown = process.env.EXPO_PUBLIC_POSTHOG_KEY;
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
}

function stop(): void {
  state.enabled = false;
  state.queue = [];
  state.distinctId = null;
  if (state.timer) clearTimeout(state.timer);
  state.timer = null;
}

/**
 * Called by the consent bridge whenever the session or the choice changes. `userId` null or
 * `consent` false switches everything off and forgets what is waiting. A different account never
 * inherits anything queued for the last one.
 */
export async function setAnalyticsConsent(
  userId: string | null,
  consent: boolean,
): Promise<void> {
  const allowed = Boolean(userId) && consent && projectKey() !== null;
  const previous = state.userId;
  if (state.enabled && allowed && previous === userId) return;
  state.generation += 1;
  const generation = state.generation;
  stop();
  state.userId = userId;
  if (!allowed) {
    state.waiting = [];
    // The id itself is forgotten by the consent bridge, after the server has recorded it for
    // deletion at PostHog (forgetAnalytics).
    return;
  }
  let id = await appStorage.get(keyOf(userId ?? '')).catch(() => null);
  if (!id) {
    id = randomUUID();
    await appStorage.set(keyOf(userId ?? ''), id).catch(() => undefined);
  }
  // Anything changed while the id was read (a "no", another account): this start-up is void.
  if (generation !== state.generation) return;
  state.distinctId = id;
  state.enabled = true;
  const ready = state.waiting;
  state.waiting = [];
  for (const run of ready) run();
}

/**
 * Runs `record` now if analytics is on, or once the member's yes is confirmed in this session
 * (a page opened by a link before settings loaded). Never if the answer turns out to be no.
 */
export function whenAnalyticsReady(record: () => void): void {
  if (state.enabled) record();
  else state.waiting.push(record);
}

/** This account's analytics id on this phone, if it has one (for deleting its data). */
export async function analyticsIdOf(userId: string): Promise<string | null> {
  return appStorage.get(keyOf(userId)).catch(() => null);
}

/** Forget an account's analytics id (account deletion, sign-out of a shared phone). */
export async function forgetAnalytics(userId: string): Promise<void> {
  if (state.userId === userId) {
    state.generation += 1;
    stop();
    state.waiting = [];
  }
  await appStorage.remove(keyOf(userId)).catch(() => undefined);
}

function common(): Record<string, unknown> {
  return {
    platform: Platform.OS,
    app_version: Constants.expoConfig?.version ?? 'unknown',
    language: currentLanguage(),
    // Location lookup off; the project also discards client IPs (launch checklist).
    $geoip_disable: true,
  };
}

/** Records an event when, and only when, the member has said yes. */
export function track<E extends AnalyticsEvent>(
  event: E,
  properties: AnalyticsEvents[E],
): void {
  if (!state.enabled || !state.distinctId) return;
  state.queue.push({
    event,
    properties: { ...common(), ...properties },
    timestamp: new Date().toISOString(),
  });
  if (state.queue.length >= MAX_QUEUE) {
    void flush();
  } else if (!state.timer) {
    state.timer = setTimeout(() => {
      state.timer = null;
      void flush();
    }, FLUSH_MS);
  }
}

/** Sends what is waiting. Best effort: a failure drops the batch rather than retrying forever. */
export async function flush(): Promise<void> {
  const key = projectKey();
  // Consent is checked again at the moment of sending.
  if (!state.enabled || !state.distinctId || !key || state.queue.length === 0) {
    if (!state.enabled) state.queue = [];
    return;
  }
  const batch = state.queue.map((item) => ({ ...item, distinct_id: state.distinctId }));
  state.queue = [];
  try {
    await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ api_key: key, batch }),
    });
  } catch {
    // Dropped: analytics never retries into a later, possibly withdrawn, session.
  }
}

/** For tests: what would be sent next. */
export function pendingEvents(): readonly Queued[] {
  return state.queue;
}

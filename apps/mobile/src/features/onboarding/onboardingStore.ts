import { PROFILE_GOALS } from '../../lib/backend/types';
import { z } from 'zod';
import { appStorage } from '../../lib/storage';

/** Stable ids are stored; labels are `goals.<id>` in the copy catalogue. */
export const GOALS = PROFILE_GOALS;
export type Goal = (typeof GOALS)[number];

const schema = z.object({
  goals: z.array(z.enum(GOALS)),
  /** The city the person picked, or null if they skipped. */
  cityId: z.string().nullable(),
  done: z.boolean(),
});
export type Onboarding = z.infer<typeof schema>;

const KEY = 'pc.onboarding.v2';
const EMPTY: Onboarding = { goals: [], cityId: null, done: false };

let current: Onboarding = EMPTY;

/** Answers given before an account exists; copied to the profile at sign-up. */
export async function loadOnboarding(): Promise<void> {
  try {
    const parsed = schema.safeParse(JSON.parse((await appStorage.get(KEY)) ?? 'null'));
    current = parsed.success ? parsed.data : EMPTY;
  } catch {
    // Unreadable storage or corrupt JSON: behave as a first launch.
    current = EMPTY;
  }
}

export const getOnboarding = (): Onboarding => current;

/** Saves and resolves only once the answers are stored; rejects if storage fails. */
export async function saveOnboardingStrict(value: Onboarding): Promise<void> {
  await appStorage.set(KEY, JSON.stringify(value));
  current = value;
}

export function saveOnboarding(value: Onboarding): void {
  current = value;
  appStorage.set(KEY, JSON.stringify(value)).catch(() => {
    // Answers are optional; if they can't be persisted the person is simply asked again.
  });
}

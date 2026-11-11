import { z } from 'zod';

export const GOALS = [
  'Cook and learn together',
  'Meet people nearby',
  'Buy food together',
  'Join online from anywhere',
] as const;

/** Berlin is the only launch city; the picker arrives with the second city. */
export const LAUNCH_CITY = { name: 'Berlin', country: 'Germany' } as const;

const schema = z.object({
  goals: z.array(z.enum(GOALS)),
  done: z.boolean(),
});
export type Onboarding = z.infer<typeof schema>;

const KEY = 'pc.onboarding.v1';
const EMPTY: Onboarding = { goals: [], done: false };

/** Answers given before an account exists; copied to the profile at sign-up. */
export function readOnboarding(): Onboarding {
  try {
    const parsed = schema.safeParse(JSON.parse(localStorage.getItem(KEY) ?? 'null'));
    return parsed.success ? parsed.data : EMPTY;
  } catch {
    // Unreadable storage (private mode, corrupt JSON): behave as a first visit.
    return EMPTY;
  }
}

export function saveOnboarding(value: Onboarding): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    // Storage can be unavailable; onboarding answers are optional, so carry on.
  }
}

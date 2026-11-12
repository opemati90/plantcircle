import type { TFunction } from 'i18next';
import type { MyPlan, Plan } from '../../lib/backend/types';
import { statusPill } from './myPlanRules';

// Stand-in translator: returns the key and its variables so the tests check which
// string is chosen, not the English wording.
const t = ((key: string, vars?: Record<string, unknown>) =>
  vars ? `${key} ${JSON.stringify(vars)}` : key) as unknown as TFunction;

const plan = { id: 'p1' } as Plan;
const item = (overrides: Partial<MyPlan>): MyPlan => ({
  plan,
  rsvp: 'going',
  waitlistPosition: null,
  offerExpiresAt: null,
  ...overrides,
});

describe('statusPill', () => {
  it('shows Going for an upcoming spot the viewer holds', () => {
    expect(statusPill(t, item({ rsvp: 'going' }), false)).toEqual({
      label: 'myPlans.pill.going',
      tone: 'positive',
    });
  });

  it('shows the place in line while waitlisted', () => {
    expect(statusPill(t, item({ rsvp: 'waitlisted', waitlistPosition: 2 }), false)).toEqual({
      label: 'myPlans.pill.waitlist {"count":2,"ordinal":true}',
      tone: 'neutral',
    });
  });

  it('asks the viewer to confirm a spot that is being held for them', () => {
    const pill = statusPill(
      t,
      item({ rsvp: 'offered', offerExpiresAt: '2026-11-13T18:30:00Z' }),
      false,
    );
    expect(pill.tone).toBe('attention');
    expect(pill.label).toMatch(/^offer\.homeLabel/);
  });

  it('never says Going for a Plan that has already happened', () => {
    expect(statusPill(t, item({ rsvp: 'going' }), true)).toEqual({
      label: 'myPlans.pill.attended',
      tone: 'neutral',
    });
  });
});

import { describe, expect, it } from 'vitest';
import type { Plan } from '../../data/types';
import { buildIcs } from './calendar';

const plan = {
  id: 'p1',
  title: 'Soup, bread; and more',
  startsAt: '2026-11-07T16:00:00.000Z',
  endsAt: '2026-11-07T19:30:00.000Z',
  venueName: 'Plant Kitchen',
  areaName: 'Neukölln',
} as Plan;

describe('buildIcs', () => {
  const now = new Date('2026-11-01T10:00:00.000Z');

  it('writes UTC times and escapes text', () => {
    const ics = buildIcs(plan, 'https://plantcircle.app/plans/p1', null, now);
    expect(ics).toContain('DTSTART:20261107T160000Z');
    expect(ics).toContain('DTEND:20261107T193000Z');
    expect(ics).toContain('SUMMARY:Soup\\, bread\\; and more');
    expect(ics).toContain('LOCATION:Plant Kitchen\\, Neukölln');
  });

  it('only includes the exact address when one was provided', () => {
    expect(buildIcs(plan, 'u', 'Weserstr. 1', now)).toContain('LOCATION:Weserstr. 1');
  });
});

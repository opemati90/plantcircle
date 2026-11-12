import { canEnd, checkinOpen } from './rules';

const window = { startsAt: '2030-06-01T18:00:00Z', endsAt: '2030-06-01T20:00:00Z' };

describe('checkinOpen', () => {
  it('opens two hours before the start and closes two hours after the end', () => {
    expect(checkinOpen(window, false, new Date('2030-06-01T15:59:00Z'))).toBe(false);
    expect(checkinOpen(window, false, new Date('2030-06-01T16:00:00Z'))).toBe(true);
    expect(checkinOpen(window, false, new Date('2030-06-01T22:00:00Z'))).toBe(true);
    expect(checkinOpen(window, false, new Date('2030-06-01T22:01:00Z'))).toBe(false);
  });

  it('is closed once the host has ended the Plan', () => {
    expect(checkinOpen(window, true, new Date('2030-06-01T18:30:00Z'))).toBe(false);
  });
});

describe('canEnd', () => {
  it('needs the start to have passed, and the Plan not to have ended', () => {
    expect(canEnd('2030-06-01T18:00:00Z', false, new Date('2030-06-01T17:59:00Z'))).toBe(false);
    expect(canEnd('2030-06-01T18:00:00Z', false, new Date('2030-06-01T18:00:00Z'))).toBe(true);
    expect(canEnd('2030-06-01T18:00:00Z', true, new Date('2030-06-01T19:00:00Z'))).toBe(false);
  });
});

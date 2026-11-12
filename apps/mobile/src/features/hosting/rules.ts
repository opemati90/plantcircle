const HOUR_MS = 3_600_000;

/**
 * Whether guests can be checked in now: from two hours before the start to two hours after the end,
 * and only while the Plan is not yet ended. The database applies the same window.
 */
export function checkinOpen(
  window: { startsAt: string; endsAt: string },
  ended: boolean,
  now: Date,
): boolean {
  if (ended) return false;
  const at = now.getTime();
  return (
    at >= Date.parse(window.startsAt) - 2 * HOUR_MS && at <= Date.parse(window.endsAt) + 2 * HOUR_MS
  );
}

/** Ending is allowed once the Plan has started and has not ended already. */
export function canEnd(startsAt: string, ended: boolean, now: Date): boolean {
  return !ended && now.getTime() >= Date.parse(startsAt);
}

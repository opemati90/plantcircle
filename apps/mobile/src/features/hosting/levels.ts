import type { HostLevel, HostStats } from '../../lib/backend/types';

/**
 * The same thresholds as `host_levels` in the database (migration 20261112002000). The fixture
 * backend computes a level from them; the real one asks the server, which is the source of truth.
 */
export const HOST_LEVELS = [
  {
    level: 1,
    recipes: 1,
    hosted: 0,
    followers: 0,
    upvotes: 0,
    maxCapacity: 6,
    inPerson: false,
    groupOrders: false,
  },
  {
    level: 2,
    recipes: 3,
    hosted: 1,
    followers: 10,
    upvotes: 0,
    maxCapacity: 12,
    inPerson: true,
    groupOrders: true,
  },
  {
    level: 3,
    recipes: 3,
    hosted: 1,
    followers: 100,
    upvotes: 2000,
    maxCapacity: 30,
    inPerson: true,
    groupOrders: true,
  },
] as const;

export function hostLevelFrom(stats: HostStats, verified = false): HostLevel {
  let current = 0;
  if (verified) {
    current = HOST_LEVELS[HOST_LEVELS.length - 1]?.level ?? 0;
  } else {
    for (const row of HOST_LEVELS) {
      if (
        stats.recipes < row.recipes ||
        stats.hosted < row.hosted ||
        stats.followers < row.followers ||
        stats.upvotes < row.upvotes
      ) {
        break;
      }
      current = row.level;
    }
  }
  const row = HOST_LEVELS.find((r) => r.level === current);
  const next = HOST_LEVELS.find((r) => r.level === current + 1);
  return {
    level: current,
    ...stats,
    maxCapacity: row?.maxCapacity ?? 0,
    inPerson: row?.inPerson ?? false,
    groupOrders: row?.groupOrders ?? false,
    next: next
      ? {
          level: next.level,
          recipes: next.recipes,
          hosted: next.hosted,
          followers: next.followers,
          upvotes: next.upvotes,
          maxCapacity: next.maxCapacity,
          inPerson: next.inPerson,
          groupOrders: next.groupOrders,
        }
      : null,
  };
}

/** What is still missing for the next level, in the order it is worth doing: recipes first. */
export function nextSteps(level: HostLevel): { key: keyof HostStats; missing: number }[] {
  if (!level.next) return [];
  const keys: (keyof HostStats)[] = ['recipes', 'hosted', 'followers', 'upvotes'];
  return keys
    .map((key) => ({ key, missing: Math.max(0, (level.next?.[key] ?? 0) - level[key]) }))
    .filter((step) => step.missing > 0);
}

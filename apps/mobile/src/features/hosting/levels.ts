import type { HostLevel, HostStats } from '../../lib/backend/types';

/**
 * The same thresholds as `host_levels` in the database (migration 20261112003400, the launch
 * rule): three posts open online Plans, and an account two weeks old opens in-person ones too.
 * Level 3 is only for staff-verified hosts. The fixture backend computes a level from these; the
 * real one asks the server, which is the source of truth.
 */
export const HOST_LEVELS = [
  { level: 1, posts: 3, accountDays: 0, maxCapacity: 12, inPerson: false, groupOrders: false },
  { level: 2, posts: 3, accountDays: 14, maxCapacity: 12, inPerson: true, groupOrders: true },
] as const;
const VERIFIED = { level: 3, maxCapacity: 30, inPerson: true, groupOrders: true } as const;

export function hostLevelFrom(stats: HostStats, verified = false): HostLevel {
  let current = 0;
  for (const row of HOST_LEVELS) {
    if (stats.posts < row.posts || stats.accountDays < row.accountDays) break;
    current = row.level;
  }
  const row = verified ? VERIFIED : HOST_LEVELS.find((r) => r.level === current);
  const next = verified ? undefined : HOST_LEVELS.find((r) => r.level === current + 1);
  return {
    ...stats,
    level: verified ? VERIFIED.level : current,
    maxCapacity: row?.maxCapacity ?? 0,
    inPerson: row?.inPerson ?? false,
    groupOrders: row?.groupOrders ?? false,
    next: next
      ? {
          level: next.level,
          recipes: 0,
          hosted: 0,
          followers: 0,
          upvotes: 0,
          posts: next.posts,
          accountDays: next.accountDays,
          maxCapacity: next.maxCapacity,
          inPerson: next.inPerson,
          groupOrders: next.groupOrders,
        }
      : null,
  };
}

/** Posts still to share before hosting opens; zero once it has (a verified host needs none). */
export function postsToHost(level: HostLevel): number {
  if (level.level > 0) return 0;
  return Math.max(0, HOST_LEVELS[0].posts - level.posts);
}

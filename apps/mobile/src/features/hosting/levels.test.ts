import { hostLevelFrom, postsToHost } from './levels';

const stats = (posts: number, accountDays: number) => ({
  recipes: 0,
  hosted: 0,
  followers: 0,
  upvotes: 0,
  posts,
  accountDays,
});

describe('hostLevelFrom', () => {
  it('opens online hosting after three posts, and in person once the account is two weeks old', () => {
    expect(hostLevelFrom(stats(2, 30))).toEqual(
      expect.objectContaining({ level: 0, maxCapacity: 0, inPerson: false }),
    );
    expect(hostLevelFrom(stats(3, 3))).toEqual(
      expect.objectContaining({ level: 1, maxCapacity: 12, inPerson: false }),
    );
    expect(hostLevelFrom(stats(3, 3)).next).toEqual(
      expect.objectContaining({ level: 2, accountDays: 14 }),
    );
    expect(hostLevelFrom(stats(3, 14))).toEqual(
      expect.objectContaining({ level: 2, inPerson: true, next: null }),
    );
  });

  it('a verified host is the top level regardless', () => {
    expect(hostLevelFrom(stats(0, 0), true)).toEqual(
      expect.objectContaining({ level: 3, maxCapacity: 30, next: null }),
    );
  });

  it('says how many posts are left before hosting opens', () => {
    expect(postsToHost(hostLevelFrom(stats(1, 0)))).toBe(2);
    expect(postsToHost(hostLevelFrom(stats(5, 0)))).toBe(0);
    expect(postsToHost(hostLevelFrom(stats(0, 0), true))).toBe(0);
  });
});

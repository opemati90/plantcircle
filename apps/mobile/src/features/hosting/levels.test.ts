import { hostLevelFrom, nextSteps } from './levels';

const none = { recipes: 0, hosted: 0, followers: 0, upvotes: 0 };

describe('hostLevelFrom', () => {
  it('is level 0 with nothing, level 1 after one recipe, level 2 with the full set', () => {
    expect(hostLevelFrom(none)).toEqual(
      expect.objectContaining({ level: 0, maxCapacity: 0, inPerson: false }),
    );
    expect(hostLevelFrom({ ...none, recipes: 1 })).toEqual(
      expect.objectContaining({ level: 1, maxCapacity: 6 }),
    );
    expect(hostLevelFrom({ recipes: 3, hosted: 1, followers: 10, upvotes: 0 })).toEqual(
      expect.objectContaining({ level: 2, inPerson: true, groupOrders: true }),
    );
    expect(
      hostLevelFrom({ recipes: 3, hosted: 1, followers: 10, upvotes: 0 }).next?.level,
    ).toBe(3);
    expect(
      hostLevelFrom({ recipes: 3, hosted: 1, followers: 100, upvotes: 2000 }).next,
    ).toBeNull();
  });

  it('a verified host is the top level regardless', () => {
    expect(hostLevelFrom(none, true).level).toBe(3);
  });

  it('lists what is missing for the next level, recipes first', () => {
    expect(
      nextSteps(hostLevelFrom({ recipes: 1, hosted: 0, followers: 4, upvotes: 0 })),
    ).toEqual([
      { key: 'recipes', missing: 2 },
      { key: 'hosted', missing: 1 },
      { key: 'followers', missing: 6 },
    ]);
    expect(nextSteps(hostLevelFrom(none, true))).toEqual([]);
  });
});

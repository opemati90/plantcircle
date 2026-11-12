import { containsPattern } from './search';

describe('containsPattern', () => {
  it('wraps the trimmed term in wildcards', () => {
    expect(containsPattern('  plant kitchen ')).toBe('%plant kitchen%');
  });

  it('escapes LIKE wildcards and the escape character, so they match as typed', () => {
    expect(containsPattern('100% Plant')).toBe('%100\\% Plant%');
    expect(containsPattern('soup_club')).toBe('%soup\\_club%');
    expect(containsPattern('a\\b')).toBe('%a\\\\b%');
  });
});

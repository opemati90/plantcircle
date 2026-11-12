/**
 * A case-insensitive "contains" pattern for LIKE, for the text the person typed. The LIKE wildcards
 * and the escape character in the text are escaped, so a search for "100%" finds "100%" and nothing
 * more.
 */
export function containsPattern(term: string): string {
  const escaped = term.trim().replace(/[\\%_]/g, (char) => `\\${char}`);
  return `%${escaped}%`;
}

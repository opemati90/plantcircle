/**
 * What Explore is browsing, kept for the session so it survives visits to other tabs.
 * `undefined` means nothing has been chosen yet, so Explore follows the home city.
 * This never writes the saved home city.
 */
export type Browse =
  { kind: 'anywhere' } | { kind: 'city'; id: string } | { kind: 'country'; code: string };

let browsed: Browse | undefined = undefined;

export const getBrowse = (): Browse | undefined => browsed;

export function setBrowse(choice: Browse): void {
  browsed = choice;
}

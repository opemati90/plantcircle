import { useSyncExternalStore } from 'react';

/**
 * Whether "Your Plans still work" makes sense: only a signed-in member has Plans saved on the
 * phone. The session sync sets it; error screens read it.
 */
let signedIn = false;
const listeners = new Set<() => void>();

export function setSavedPlansAvailable(next: boolean): void {
  if (next === signedIn) return;
  signedIn = next;
  for (const listener of listeners) listener();
}

export function useSavedPlansAvailable(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => signedIn,
    () => false,
  );
}

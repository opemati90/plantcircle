import { describe, expect, it } from 'vitest';
import { toBackendError } from './supabaseBackend';

describe('toBackendError', () => {
  it('maps database rule violations to domain codes', () => {
    expect(toBackendError({ message: 'plan_full', code: 'P0001' }).code).toBe('plan_full');
    expect(toBackendError({ message: 'plan_not_found' }).code).toBe('not_found');
    expect(toBackendError({ message: 'item_taken' }).code).toBe('item_taken');
  });

  it('recognises network, rate-limit and expired-session failures', () => {
    expect(toBackendError({ message: 'TypeError: Failed to fetch' }).code).toBe('network');
    expect(toBackendError({ message: 'slow down', status: 429 }).code).toBe('rate_limited');
    expect(toBackendError({ message: 'JWT expired', code: 'PGRST301' }).code).toBe(
      'not_authenticated',
    );
    expect(toBackendError({ message: 'boom' }).code).toBe('unknown');
  });
});

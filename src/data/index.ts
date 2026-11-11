import { z } from 'zod';
import type { Backend } from './backend';

const envSchema = z.object({
  VITE_SUPABASE_URL: z.url().optional(),
  VITE_SUPABASE_ANON_KEY: z.string().min(20).optional(),
});

export class ConfigurationError extends Error {}

/**
 * Chooses the backend once at startup. A production build without Supabase
 * configuration fails loudly instead of silently serving fixture data.
 */
export async function loadBackend(): Promise<Backend> {
  const env = envSchema.safeParse({
    VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL || undefined,
    VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY || undefined,
  });
  if (!env.success) {
    throw new ConfigurationError(`Invalid environment: ${env.error.message}`);
  }

  const { VITE_SUPABASE_URL: url, VITE_SUPABASE_ANON_KEY: anonKey } = env.data;
  if (url && anonKey) {
    const { createSupabaseBackend } = await import('./supabase/supabaseBackend');
    return createSupabaseBackend(url, anonKey);
  }
  if (import.meta.env.DEV) {
    const { createFixtureBackend } = await import('./fixtures/fixtureBackend');
    return createFixtureBackend();
  }
  throw new ConfigurationError(
    'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set for production builds.',
  );
}

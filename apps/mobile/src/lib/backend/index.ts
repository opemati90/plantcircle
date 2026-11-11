import { z } from 'zod';
import type { Backend } from './backend';

const envSchema = z.object({
  url: z.url().optional(),
  anonKey: z.string().min(20).optional(),
});

export class ConfigurationError extends Error {}

/** Empty or missing variables both mean "not configured". */
const readEnv = (value: unknown) => (typeof value === 'string' && value ? value : undefined);

/**
 * Chooses the backend once at startup. A release build without Supabase
 * configuration fails loudly instead of silently serving fixture data.
 */
export async function loadBackend(): Promise<Backend> {
  const env = envSchema.safeParse({
    url: readEnv(process.env.EXPO_PUBLIC_SUPABASE_URL),
    anonKey: readEnv(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY),
  });
  if (!env.success) {
    throw new ConfigurationError(`Invalid environment: ${env.error.message}`);
  }

  const { url, anonKey } = env.data;
  if (url && anonKey) {
    const { createSupabaseBackend } = await import('./supabase/supabaseBackend');
    return createSupabaseBackend(url, anonKey);
  }
  if (__DEV__) {
    const { createFixtureBackend } = await import('./fixtures/fixtureBackend');
    return createFixtureBackend();
  }
  throw new ConfigurationError(
    'EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY must be set for release builds.',
  );
}

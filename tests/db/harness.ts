import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';

const MIGRATIONS_DIR = join(import.meta.dirname, '../../supabase/migrations');

/**
 * The parts of a Supabase project the migrations rely on: the two client roles,
 * `auth.users`, and `auth.uid()` reading the JWT subject from a request setting.
 */
const SUPABASE_PRELUDE = `
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant usage on schema auth to anon, authenticated;
  grant usage on schema public to anon, authenticated;
  -- Supabase grants everything on new public objects to the client roles by
  -- default; reproduce that so the migration's revokes are actually exercised.
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant execute on functions to anon, authenticated;
`;

export async function createDatabase(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(SUPABASE_PRELUDE);
  for (const file of readdirSync(MIGRATIONS_DIR).sort()) {
    await db.exec(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));
  }
  return db;
}

/** Runs `run` as a signed-in member (or as `anon` when `userId` is null). */
export async function asUser<T>(
  db: PGlite,
  userId: string | null,
  run: () => Promise<T>,
): Promise<T> {
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [userId ?? '']);
  await db.exec(`set role ${userId ? 'authenticated' : 'anon'}`);
  try {
    return await run();
  } finally {
    await db.exec('reset role');
  }
}

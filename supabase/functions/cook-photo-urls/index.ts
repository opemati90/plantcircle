// Signed links for "Cooked it" photos. Members cannot read the private `cook-photos` bucket
// themselves (a link they signed could last as long as they liked and outlive a block or a
// leave), so the app asks here. The database answers, as the member, which of the paths they may
// see (cook_photos_readable, migration 20261112003100); only those are signed, for 10 minutes.
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type, apikey, x-client-info',
  'access-control-allow-methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'content-type': 'application/json' },
  });

const LIFETIME_SECONDS = 600;
const MAX_PATHS = 100;
const PATH = /^[0-9a-f-]{36}\/[0-9a-f-]{36}(\.thumb)?\.jpg$/;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  const header = req.headers.get('authorization') ?? '';
  if (!header.startsWith('Bearer ')) return json({ error: 'not_authenticated' }, 401);

  let body: { paths?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_input' }, 400);
  }
  const paths = Array.isArray(body.paths)
    ? [...new Set(body.paths.filter((p): p is string => typeof p === 'string' && PATH.test(p)))]
    : [];
  if (paths.length === 0 || paths.length > MAX_PATHS)
    return json({ error: 'invalid_input' }, 400);

  const service = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  // A signed-in member only: the public key is a valid token too, but names nobody.
  const user = await service.auth.getUser(header.slice(7));
  if (!user.data.user) return json({ error: 'not_authenticated' }, 401);

  // Asked as the member: the database decides what this person may see.
  const asMember = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    {
      global: { headers: { Authorization: header } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  const allowed = await asMember.rpc('cook_photos_readable', { p_paths: paths });
  if (allowed.error) {
    return allowed.error.code === 'PGRST301'
      ? json({ error: 'not_authenticated' }, 401)
      : json({ error: 'server' }, 500);
  }
  const readable = ((allowed.data ?? []) as unknown[]).filter(
    (p): p is string => typeof p === 'string',
  );
  if (readable.length === 0) return json({ urls: {} });

  const signed = await service.storage
    .from('cook-photos')
    .createSignedUrls(readable, LIFETIME_SECONDS);
  if (signed.error) return json({ error: 'server' }, 500);
  const urls: Record<string, string> = {};
  for (const entry of signed.data) {
    if (entry.path && entry.signedUrl && !entry.error) urls[entry.path] = entry.signedUrl;
  }
  return json({ urls });
});

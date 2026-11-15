// Background workers run with the service role, so only the scheduler may start them: a POST
// carrying the service-role key. The gateway's JWT check alone would also let in the public anon
// key and any signed-in member.

const encoder = new TextEncoder();

/** Compares in constant time, so the key cannot be guessed byte by byte from response timing. */
function sameSecret(a: string, b: string): boolean {
  const x = encoder.encode(a);
  const y = encoder.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i += 1) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

/** Null when the caller is the scheduler; otherwise the response to return. */
export function refuseUnlessScheduler(req: Request): Response | null {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const header = req.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!key || !token || !sameSecret(token, key)) {
    return new Response('forbidden', { status: 403 });
  }
  return null;
}

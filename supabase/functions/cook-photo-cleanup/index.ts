// Removes "Cooked it" photos (and their thumbnails) from Storage: deleted posts, deleted
// accounts, posts staff removed once their 90 days are up, and uploads never used. The database
// queues them (cook_photo_deletions); this claims a batch under a lease, removes the files
// through the Storage API (deleting rows in SQL would leave the bytes behind) and only then drops
// the rows. A failed batch is claimed again after the lease runs out.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { refuseUnlessScheduler } from '../_shared/workerAuth.ts';

const BATCH = 100;

Deno.serve(async (req) => {
  const refused = refuseUnlessScheduler(req);
  if (refused) return refused;
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const claimed = await supabase.rpc('cook_photo_deletions_claim', { p_limit: BATCH });
  if (claimed.error) return new Response(claimed.error.message, { status: 500 });
  const paths = ((claimed.data ?? []) as string[]).filter((p) => typeof p === 'string');
  if (paths.length === 0) return new Response('nothing to remove');

  const files = paths.flatMap((p) => [p, p.replace(/\.jpg$/, '.thumb.jpg')]);
  // Removing a file that is already gone is not an error, so a retried batch is safe.
  const removed = await supabase.storage.from('cook-photos').remove(files);
  if (removed.error) return new Response(removed.error.message, { status: 500 });
  const done = await supabase.from('cook_photo_deletions').delete().in('photo_path', paths);
  if (done.error) return new Response(done.error.message, { status: 500 });
  return new Response(`removed ${paths.length}`);
});

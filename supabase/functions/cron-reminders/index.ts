// Runs notifications_enqueue_due_and_cleanup() on demand. The 15-minute schedule runs the same
// function inside the database (pg_cron, migration 20261112003000), so this endpoint is only for
// a manual run, and only with the service-role key.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { refuseUnlessScheduler } from '../_shared/workerAuth.ts';

Deno.serve(async (req) => {
  const refused = refuseUnlessScheduler(req);
  if (refused) return refused;
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const result = await supabase.rpc('notifications_enqueue_due_and_cleanup');
  if (result.error) return new Response(result.error.message, { status: 500 });
  return new Response(`enqueued ${String(result.data)}`);
});

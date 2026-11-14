// Every 15 minutes: expires waitlist offers (the next in line is offered and told), settles
// group orders past their cutoff, and writes the reminders, address unlocks and closing notices
// that are due. All of that is notifications_enqueue_due().
import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const result = await supabase.rpc('notifications_enqueue_due_and_cleanup');
  if (result.error) return new Response(result.error.message, { status: 500 });
  return new Response(`enqueued ${String(result.data)}`);
});

// Deletes analytics data at PostHog (EU) for ids members asked to forget: account deletion and
// withdrawn consent (analytics_deletions, migration 20261112003500). Each id's person is deleted
// with its events. Needs POSTHOG_PERSONAL_API_KEY (a personal API key with person write access)
// and POSTHOG_PROJECT_ID; until both are set, requests wait, nothing is lost. Scheduler only.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { refuseUnlessScheduler } from '../_shared/workerAuth.ts';

const API = 'https://eu.posthog.com/api/projects';
const BATCH = 50;

Deno.serve(async (req) => {
  const refused = refuseUnlessScheduler(req);
  if (refused) return refused;
  const key = Deno.env.get('POSTHOG_PERSONAL_API_KEY');
  const project = Deno.env.get('POSTHOG_PROJECT_ID');
  if (!key || !project) return new Response('posthog not configured; requests wait');
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const pending = await supabase
    .from('analytics_deletions')
    .select('distinct_id')
    .is('done_at', null)
    .order('created_at')
    .limit(BATCH);
  if (pending.error) return new Response(pending.error.message, { status: 500 });
  const headers = { Authorization: `Bearer ${key}` };
  let done = 0;
  for (const row of (pending.data ?? []) as { distinct_id: string }[]) {
    const found = await fetch(
      `${API}/${project}/persons/?distinct_id=${encodeURIComponent(row.distinct_id)}`,
      { headers },
    );
    if (!found.ok) continue;
    const people =
      ((await found.json()) as { results?: { id: string | number }[] }).results ?? [];
    let ok = true;
    for (const person of people) {
      const removed = await fetch(
        `${API}/${project}/persons/${String(person.id)}/?delete_events=true`,
        { method: 'DELETE', headers },
      );
      if (!removed.ok && removed.status !== 404) ok = false;
    }
    if (!ok) continue;
    // No person means nothing was ever sent for it: done as well.
    const mark = await supabase
      .from('analytics_deletions')
      .update({ done_at: new Date().toISOString() })
      .eq('distinct_id', row.distinct_id);
    if (!mark.error) done += 1;
  }
  return new Response(`forgot ${String(done)}`);
});

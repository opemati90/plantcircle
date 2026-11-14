-- Push text in the member's language. The app keeps the member's language on user_settings;
-- push-dispatch renders title and body from the copy catalogues (functions/push-dispatch/copy.json,
-- generated from packages/copy) at send time. The English title/body notify() stores stay as the
-- fallback for a type the catalogue does not know.
--
-- settings_get/settings_update (20261112001300) were edited in place to carry `language`: no
-- database had applied them yet (no Supabase project exists, see README).

alter table public.user_settings add column language text not null default 'en'
  check (language in ('en', 'de', 'es', 'pt', 'fr', 'pl', 'it', 'nl'));

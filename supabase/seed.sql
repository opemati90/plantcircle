-- Seed data (run by `supabase db reset`, not a migration). Starter city list, pre-added so people can pick a home city (and browse other cities).
-- Placeholder chosen by the engineer, not confirmed by the owner: replace with the launch list.
-- Sources disagree on the launch footprint (product docs: Berlin; PRD: pilot chapters across
-- Africa and the Americas). The city table is data, so changing the list needs no code change.
insert into public.cities (name, country_code, tz) values
  ('Berlin', 'DE', 'Europe/Berlin'),
  ('Hamburg', 'DE', 'Europe/Berlin'),
  ('Munich', 'DE', 'Europe/Berlin'),
  ('Cologne', 'DE', 'Europe/Berlin'),
  ('Lisbon', 'PT', 'Europe/Lisbon'),
  ('Porto', 'PT', 'Europe/Lisbon'),
  ('London', 'GB', 'Europe/London'),
  ('Amsterdam', 'NL', 'Europe/Amsterdam'),
  ('Paris', 'FR', 'Europe/Paris'),
  ('Milan', 'IT', 'Europe/Rome'),
  ('Rome', 'IT', 'Europe/Rome'),
  ('Warsaw', 'PL', 'Europe/Warsaw'),
  ('Toronto', 'CA', 'America/Toronto'),
  ('New York', 'US', 'America/New_York'),
  ('Mexico City', 'MX', 'America/Mexico_City'),
  ('São Paulo', 'BR', 'America/Sao_Paulo'),
  ('Lagos', 'NG', 'Africa/Lagos'),
  ('Nairobi', 'KE', 'Africa/Nairobi'),
  ('Accra', 'GH', 'Africa/Accra'),
  ('Johannesburg', 'ZA', 'Africa/Johannesburg')
on conflict (name, country_code) do nothing;

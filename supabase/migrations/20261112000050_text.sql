-- Trimming text the same way the app does (JavaScript's String.prototype.trim): ASCII and Unicode
-- whitespace from both ends. Used wherever a host or guest types text the database stores.
create function public.text_trim(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(
    coalesce(p_text, ''),
    '^[[:space:]   -     　﻿]+|[[:space:]   -     　﻿]+$',
    '',
    'g');
$$;

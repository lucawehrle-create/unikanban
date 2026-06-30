-- Rate-Limit für die Edge Function `parse-timetable` (Stundenplan-Upload).
-- Begrenzt Uploads pro Nutzer & Minute, um den kostenpflichtigen Anthropic-Key
-- vor Spam zu schützen.
--
-- Optional: Ohne diese Tabelle läuft die Function weiter, nur ohne Limit
-- (graceful fallback im Code). Mit der Tabelle greift das Limit automatisch.
--
-- Einspielen:  im Supabase-SQL-Editor ausführen (oder via Migration).

create table if not exists public.parse_timetable_calls (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  called_at timestamptz not null default now()
);

create index if not exists parse_timetable_calls_user_time
  on public.parse_timetable_calls (user_id, called_at desc);

-- Nur die Service-Role (Edge Function) liest/schreibt. RLS an, keine Policies
-- für anon/authenticated → kein direkter Client-Zugriff.
alter table public.parse_timetable_calls enable row level security;

-- Aufräum-Hilfe: alte Einträge können per Cron gelöscht werden, z. B.
--   delete from public.parse_timetable_calls where called_at < now() - interval '1 day';

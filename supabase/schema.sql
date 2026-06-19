-- SemBan Cloud-Sync – einmalig im Supabase SQL-Editor ausführen.
-- Speichert pro Nutzer den gesamten Datenbestand als ein JSON-Dokument
-- (das bestehende Backup-Format). Row-Level-Security stellt sicher, dass
-- jede Person nur ihre eigenen Daten sieht und schreibt.

create table if not exists public.user_data (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb       not null,
  updated_at timestamptz not null default now()
);

alter table public.user_data enable row level security;

-- Lesen nur die eigene Zeile
create policy "user_data: select own"
  on public.user_data for select
  using (auth.uid() = user_id);

-- Anlegen nur für sich selbst
create policy "user_data: insert own"
  on public.user_data for insert
  with check (auth.uid() = user_id);

-- Aktualisieren nur die eigene Zeile
create policy "user_data: update own"
  on public.user_data for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Löschen nur die eigene Zeile (optional, z.B. für „Konto leeren")
create policy "user_data: delete own"
  on public.user_data for delete
  using (auth.uid() = user_id);

-- Feedback-Feature: Feature-Wünsche (öffentlich, votebar) + Bug-Reports (privat).
-- Im Supabase SQL-Editor ausführen. Idempotent (kann erneut laufen).
--
-- Admin (sieht alle Bug-Reports & darf Feature-Status setzen): per E-Mail.
-- Bei anderer Admin-Adresse die drei Vorkommen unten anpassen.

-- ---------- Tabellen ----------

create table if not exists public.feature_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  author_name text,
  title text not null,
  description text,
  status text not null default 'open',          -- open | planned | done | declined
  created_at timestamptz not null default now()
);

create table if not exists public.feature_votes (
  feature_id uuid not null references public.feature_requests (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  value smallint not null check (value in (-1, 1)),
  created_at timestamptz not null default now(),
  primary key (feature_id, user_id)
);

create table if not exists public.bug_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  reporter_email text,
  title text not null,
  description text,
  app_info text,
  status text not null default 'new',            -- new | triaged | fixed | wontfix
  created_at timestamptz not null default now()
);

-- ---------- Row Level Security ----------

alter table public.feature_requests enable row level security;
alter table public.feature_votes    enable row level security;
alter table public.bug_reports       enable row level security;

-- feature_requests: alle Eingeloggten lesen; eigene anlegen;
-- Admin darf Status ändern; Autor oder Admin darf löschen.
drop policy if exists fr_select on public.feature_requests;
create policy fr_select on public.feature_requests
  for select to authenticated using (true);

drop policy if exists fr_insert on public.feature_requests;
create policy fr_insert on public.feature_requests
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists fr_update_admin on public.feature_requests;
create policy fr_update_admin on public.feature_requests
  for update to authenticated
  using ((auth.jwt() ->> 'email') = 'lucawehrle@gmail.com');

-- Autoren dürfen ihren eigenen Wunsch bearbeiten (Titel/Beschreibung).
drop policy if exists fr_update_author on public.feature_requests;
create policy fr_update_author on public.feature_requests
  for update to authenticated
  using (auth.uid() = user_id);

drop policy if exists fr_delete on public.feature_requests;
create policy fr_delete on public.feature_requests
  for delete to authenticated
  using (auth.uid() = user_id or (auth.jwt() ->> 'email') = 'lucawehrle@gmail.com');

-- feature_votes: alle lesen (für die Zählung); nur eigene Stimme schreiben.
drop policy if exists fv_select on public.feature_votes;
create policy fv_select on public.feature_votes
  for select to authenticated using (true);

drop policy if exists fv_insert on public.feature_votes;
create policy fv_insert on public.feature_votes
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists fv_update on public.feature_votes;
create policy fv_update on public.feature_votes
  for update to authenticated using (auth.uid() = user_id);

drop policy if exists fv_delete on public.feature_votes;
create policy fv_delete on public.feature_votes
  for delete to authenticated using (auth.uid() = user_id);

-- bug_reports: nur Autor ODER Admin liest; eigene anlegen; Admin/Autor verwalten.
drop policy if exists br_select on public.bug_reports;
create policy br_select on public.bug_reports
  for select to authenticated
  using (auth.uid() = user_id or (auth.jwt() ->> 'email') = 'lucawehrle@gmail.com');

drop policy if exists br_insert on public.bug_reports;
create policy br_insert on public.bug_reports
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists br_update_admin on public.bug_reports;
create policy br_update_admin on public.bug_reports
  for update to authenticated
  using ((auth.jwt() ->> 'email') = 'lucawehrle@gmail.com');

drop policy if exists br_delete on public.bug_reports;
create policy br_delete on public.bug_reports
  for delete to authenticated
  using (auth.uid() = user_id or (auth.jwt() ->> 'email') = 'lucawehrle@gmail.com');

-- Feedback-Feature: Feature-Wünsche (öffentlich, votebar) + Bug-Reports (privat).
-- Im Supabase SQL-Editor ausführen. Idempotent (kann erneut laufen).
--
-- Admin (sieht alle Bug-Reports & darf Feature-Status setzen): per E-Mail.
-- Bei anderer Admin-Adresse die drei Vorkommen unten anpassen.
--
-- WICHTIG: Die Admin-Prüfung stützt sich auf die E-Mail im JWT. Das ist nur
-- sicher, solange in Supabase (Auth → Providers) die E-Mail-BESTÄTIGUNG aktiv
-- ist – sonst könnte sich jemand mit der Admin-Adresse registrieren, ohne sie
-- zu besitzen, und würde Admin-Rechte erben. „Confirm email" also aktiviert
-- lassen und keine OAuth-Provider erlauben, die unbestätigte E-Mails liefern.

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

-- Spalten für Kategorie & Anonymität (auch für bestehende Installationen).
alter table public.feature_requests add column if not exists category text;
alter table public.feature_requests add column if not exists is_anonymous boolean not null default false;

create table if not exists public.feature_comments (
  id uuid primary key default gen_random_uuid(),
  feature_id uuid not null references public.feature_requests (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  author_name text,
  body text not null,
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
  category text,
  app_info text,
  status text not null default 'new',            -- new | triaged | fixed | wontfix
  created_at timestamptz not null default now()
);

-- Kategorie auch für bestehende bug_reports-Installationen.
alter table public.bug_reports add column if not exists category text;

-- ---------- Row Level Security ----------

alter table public.feature_requests enable row level security;
alter table public.feature_votes    enable row level security;
alter table public.feature_comments enable row level security;
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
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- RLS allein kann nicht verhindern, dass ein Autor beim Bearbeiten AUCH den
-- `status` (oder user_id/created_at) mitändert – das darf nur der Admin. Ein
-- Trigger friert diese Felder für Nicht-Admins auf den bisherigen Wert ein.
create or replace function public.lock_feature_fields()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  if (auth.jwt() ->> 'email') is distinct from 'lucawehrle@gmail.com' then
    new.status := old.status;
    new.user_id := old.user_id;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_lock_feature_fields on public.feature_requests;
create trigger trg_lock_feature_fields
  before update on public.feature_requests
  for each row execute function public.lock_feature_fields();

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

-- feature_comments: alle Eingeloggten lesen; eigene anlegen; Autor/Admin löschen.
drop policy if exists fc_select on public.feature_comments;
create policy fc_select on public.feature_comments
  for select to authenticated using (true);

drop policy if exists fc_insert on public.feature_comments;
create policy fc_insert on public.feature_comments
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists fc_delete on public.feature_comments;
create policy fc_delete on public.feature_comments
  for delete to authenticated
  using (auth.uid() = user_id or (auth.jwt() ->> 'email') = 'lucawehrle@gmail.com');

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

-- ---------- KI-Coach: Nachfrage-/Interesse-Signal (eine Zeile pro Nutzer) ----------
create table if not exists public.coach_interest (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text,
  pay_signal text,                               -- yes | maybe | free_only
  note text,
  created_at timestamptz not null default now()
);

alter table public.coach_interest enable row level security;

drop policy if exists ci_select on public.coach_interest;
create policy ci_select on public.coach_interest
  for select to authenticated
  using (auth.uid() = user_id or (auth.jwt() ->> 'email') = 'lucawehrle@gmail.com');

drop policy if exists ci_insert on public.coach_interest;
create policy ci_insert on public.coach_interest
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists ci_update on public.coach_interest;
create policy ci_update on public.coach_interest
  for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

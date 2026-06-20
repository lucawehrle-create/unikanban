-- SemBan Deadline-Erinnerungen (Web Push) – einmalig im Supabase SQL-Editor
-- ausführen. Legt drei Tabellen an:
--   push_subscriptions – die Web-Push-Endpunkte der Geräte eines Nutzers
--   reminder_settings  – pro Nutzer: an/aus, Vorlauf, Uhrzeit, Zeitzone
--   reminder_log       – verhindert doppeltes Senden (nur Service-Role)
-- Row-Level-Security stellt sicher, dass jede Person nur ihre eigenen Daten
-- sieht. Die Datei ist gefahrlos mehrfach ausführbar.

-- ---------------------------------------------------------------------------
-- 1) push_subscriptions
-- ---------------------------------------------------------------------------
create table if not exists public.push_subscriptions (
  endpoint     text        primary key,
  user_id      uuid        not null references auth.users (id) on delete cascade,
  subscription jsonb       not null,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists push_subscriptions_user_id_idx
  on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

-- Lesen nur die eigenen Abos
drop policy if exists "push_subscriptions: select own" on public.push_subscriptions;
create policy "push_subscriptions: select own"
  on public.push_subscriptions for select
  using (auth.uid() = user_id);

-- Anlegen nur für sich selbst
drop policy if exists "push_subscriptions: insert own" on public.push_subscriptions;
create policy "push_subscriptions: insert own"
  on public.push_subscriptions for insert
  with check (auth.uid() = user_id);

-- Aktualisieren nur die eigenen Abos
drop policy if exists "push_subscriptions: update own" on public.push_subscriptions;
create policy "push_subscriptions: update own"
  on public.push_subscriptions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Löschen nur die eigenen Abos
drop policy if exists "push_subscriptions: delete own" on public.push_subscriptions;
create policy "push_subscriptions: delete own"
  on public.push_subscriptions for delete
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 2) reminder_settings
-- ---------------------------------------------------------------------------
create table if not exists public.reminder_settings (
  user_id     uuid        primary key references auth.users (id) on delete cascade,
  enabled     boolean     not null default true,
  lead_days   int         not null default 1,
  notify_hour int         not null default 8,
  tz          text        not null default 'Europe/Berlin',
  updated_at  timestamptz not null default now()
);

alter table public.reminder_settings enable row level security;

-- Vollzugriff nur auf die eigene Zeile
drop policy if exists "reminder_settings: select own" on public.reminder_settings;
create policy "reminder_settings: select own"
  on public.reminder_settings for select
  using (auth.uid() = user_id);

drop policy if exists "reminder_settings: insert own" on public.reminder_settings;
create policy "reminder_settings: insert own"
  on public.reminder_settings for insert
  with check (auth.uid() = user_id);

drop policy if exists "reminder_settings: update own" on public.reminder_settings;
create policy "reminder_settings: update own"
  on public.reminder_settings for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "reminder_settings: delete own" on public.reminder_settings;
create policy "reminder_settings: delete own"
  on public.reminder_settings for delete
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 3) reminder_log
-- ---------------------------------------------------------------------------
-- Protokoll der bereits versendeten Erinnerungen, damit pro Aufgabe und
-- Fälligkeitsdatum nur EINMAL benachrichtigt wird.
-- RLS ist aktiv, es gibt aber BEWUSST KEINE Policy: ausschließlich die
-- Service-Role (in der Edge-Function) schreibt/liest diese Tabelle, und die
-- Service-Role umgeht RLS. Damit ist die Tabelle für normale Nutzer komplett
-- unzugänglich.
create table if not exists public.reminder_log (
  user_id  uuid        not null references auth.users (id) on delete cascade,
  task_id  text        not null,
  due_date text        not null,
  sent_at  timestamptz not null default now(),
  primary key (user_id, task_id, due_date)
);

alter table public.reminder_log enable row level security;
-- (keine Policies – nur Service-Role)

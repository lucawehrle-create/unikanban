-- SemBan Kalender-Abo (webcal) – einmalig im Supabase SQL-Editor ausführen.
-- Legt pro Nutzer ein Geheim-Token an, über das die Edge-Function
-- `calendar-feed` einen stets aktuellen iCalendar-Feed ausliefert. Kalender-
-- Apps (Apple/Google/Outlook) abonnieren diesen Link und aktualisieren ihn
-- regelmäßig automatisch. Die Datei ist gefahrlos mehrfach ausführbar.

create table if not exists public.calendar_tokens (
  user_id    uuid        primary key references auth.users (id) on delete cascade,
  token      text        not null unique,
  created_at timestamptz not null default now()
);

create index if not exists calendar_tokens_token_idx
  on public.calendar_tokens (token);

alter table public.calendar_tokens enable row level security;

-- Jede Person verwaltet nur ihr eigenes Token. Die Edge-Function liest die
-- Zuordnung Token → Nutzer mit dem Service-Role-Key (umgeht RLS bewusst).
drop policy if exists "calendar_tokens: select own" on public.calendar_tokens;
create policy "calendar_tokens: select own"
  on public.calendar_tokens for select
  using (auth.uid() = user_id);

drop policy if exists "calendar_tokens: insert own" on public.calendar_tokens;
create policy "calendar_tokens: insert own"
  on public.calendar_tokens for insert
  with check (auth.uid() = user_id);

drop policy if exists "calendar_tokens: update own" on public.calendar_tokens;
create policy "calendar_tokens: update own"
  on public.calendar_tokens for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "calendar_tokens: delete own" on public.calendar_tokens;
create policy "calendar_tokens: delete own"
  on public.calendar_tokens for delete
  using (auth.uid() = user_id);

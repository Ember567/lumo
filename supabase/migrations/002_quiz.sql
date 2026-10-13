-- ============================================================
-- Lumo — Migration 002: KI-Quiz
--
-- Für Datenbanken, auf denen schema.sql bereits gelaufen ist.
-- (Neue Installationen: schema.sql enthält diese Teile schon.)
-- Im Supabase SQL-Editor einmal ausführen.
-- ============================================================

-- ------------------------------------------------------------
-- QUIZ-VERSUCHE — ein Eintrag pro ausgewertetem Quiz
-- ------------------------------------------------------------
create table if not exists public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  topic_id uuid,
  subject_id uuid,
  question_count int not null check (question_count > 0),
  correct_count int not null check (correct_count >= 0 and correct_count <= question_count),
  questions jsonb not null,
  created_at timestamptz not null default now(),
  check (topic_id is not null or subject_id is not null),
  foreign key (topic_id, user_id) references public.plan_topics(id, user_id) on delete cascade,
  foreign key (subject_id, user_id) references public.plan_subjects(id, user_id) on delete cascade
);

create index if not exists quiz_attempts_user_topic_idx on public.quiz_attempts(user_id, topic_id, created_at);

alter table public.quiz_attempts enable row level security;
drop policy if exists "Nur eigene Zeilen" on public.quiz_attempts;
create policy "Nur eigene Zeilen" on public.quiz_attempts for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.quiz_attempts to authenticated;

-- ------------------------------------------------------------
-- KI-NUTZUNG — ein Eintrag pro KI-Anfrage. Nutzer dürfen ihre
-- Einträge nur LESEN (nicht löschen), sonst liesse sich das
-- Tageslimit umgehen. Geschrieben wird nur über consume_ai_quota().
-- ------------------------------------------------------------
create table if not exists public.ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_user_created_idx on public.ai_usage(user_id, created_at);
create index if not exists ai_usage_created_idx on public.ai_usage(created_at);

alter table public.ai_usage enable row level security;
drop policy if exists "Eigene Nutzung lesen" on public.ai_usage;
create policy "Eigene Nutzung lesen" on public.ai_usage for select to authenticated
  using ((select auth.uid()) = user_id);
revoke all on public.ai_usage from anon, authenticated;
grant select on public.ai_usage to authenticated;

-- ------------------------------------------------------------
-- consume_ai_quota(p_user, user_limit, global_limit)
-- Prüft und verbucht eine KI-Anfrage atomar. Zählt pro Kalendertag
-- (Zeitzone Europe/Zurich). global_limit schützt das Gratis-Kontingent
-- des KI-Anbieters über alle Nutzer hinweg.
-- NUR für service_role (die Edge Function) ausführbar — Nutzer könnten
-- sonst eigene Limits übergeben und das globale Kontingent leerspammen.
-- Gibt die für den Nutzer heute verbleibenden Anfragen zurück oder
-- wirft AI_QUOTA_USER / AI_QUOTA_GLOBAL.
-- ------------------------------------------------------------
drop function if exists public.consume_ai_quota(int, int);

create or replace function public.consume_ai_quota(p_user uuid, user_limit int, global_limit int)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day_start timestamptz := (date_trunc('day', now() at time zone 'Europe/Zurich')) at time zone 'Europe/Zurich';
  v_user_used int;
  v_global_used int;
begin
  if p_user is null then
    raise exception 'Nicht angemeldet';
  end if;

  -- Serialisiert gleichzeitige Anfragen, damit kein Limit doppelt überschritten wird.
  perform pg_advisory_xact_lock(hashtext('lumo_ai_quota'));

  select count(*) into v_global_used from public.ai_usage where created_at >= v_day_start;
  if v_global_used >= global_limit then
    raise exception 'AI_QUOTA_GLOBAL';
  end if;

  select count(*) into v_user_used from public.ai_usage where user_id = p_user and created_at >= v_day_start;
  if v_user_used >= user_limit then
    raise exception 'AI_QUOTA_USER';
  end if;

  insert into public.ai_usage (user_id) values (p_user);
  return user_limit - v_user_used - 1;
end;
$$;

revoke all on function public.consume_ai_quota(uuid, int, int) from public, anon, authenticated;
grant execute on function public.consume_ai_quota(uuid, int, int) to service_role;

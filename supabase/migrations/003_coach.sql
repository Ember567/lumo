-- ============================================================
-- Lumo — Migration 003: Lernbegleiter Lumi
--
-- KI-Nutzung wird nach Art getrennt gezählt ('quiz' | 'coach'),
-- damit der Chat das Quiz-Kontingent nicht aufbraucht und umgekehrt.
-- Im Supabase SQL-Editor einmal ausführen.
-- ============================================================

alter table public.ai_usage
  add column if not exists kind text not null default 'quiz';

alter table public.ai_usage drop constraint if exists ai_usage_kind_check;
alter table public.ai_usage add constraint ai_usage_kind_check check (kind in ('quiz', 'coach'));

create index if not exists ai_usage_kind_user_created_idx on public.ai_usage(kind, user_id, created_at);

-- ------------------------------------------------------------
-- consume_ai_quota(p_user, p_kind, user_limit, global_limit)
-- Wie bisher, aber pro Art. Nur für service_role (Edge Functions).
-- ------------------------------------------------------------
create or replace function public.consume_ai_quota(p_user uuid, p_kind text, user_limit int, global_limit int)
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
  if p_kind not in ('quiz', 'coach') then
    raise exception 'Unbekannte Art';
  end if;

  perform pg_advisory_xact_lock(hashtext('lumo_ai_quota_' || p_kind));

  select count(*) into v_global_used from public.ai_usage
   where kind = p_kind and created_at >= v_day_start;
  if v_global_used >= global_limit then
    raise exception 'AI_QUOTA_GLOBAL';
  end if;

  select count(*) into v_user_used from public.ai_usage
   where kind = p_kind and user_id = p_user and created_at >= v_day_start;
  if v_user_used >= user_limit then
    raise exception 'AI_QUOTA_USER';
  end if;

  insert into public.ai_usage (user_id, kind) values (p_user, p_kind);
  return user_limit - v_user_used - 1;
end;
$$;

-- Bisherige Signatur (Quiz-Function) bleibt gültig und zählt nur Quizze.
create or replace function public.consume_ai_quota(p_user uuid, user_limit int, global_limit int)
returns int
language sql
security definer
set search_path = ''
as $$
  select public.consume_ai_quota(p_user, 'quiz', user_limit, global_limit);
$$;

revoke all on function public.consume_ai_quota(uuid, text, int, int) from public, anon, authenticated;
revoke all on function public.consume_ai_quota(uuid, int, int) from public, anon, authenticated;
grant execute on function public.consume_ai_quota(uuid, text, int, int) to service_role;
grant execute on function public.consume_ai_quota(uuid, int, int) to service_role;

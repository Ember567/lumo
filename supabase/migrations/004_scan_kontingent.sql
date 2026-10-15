-- ============================================================
-- Lumo — Migration 004: Foto-Scan und Kontingent-Anzeige
--
-- - KI-Nutzung kennt eine dritte Art: 'scan' (Lernmaterial aus Foto/PDF)
-- - pro Anfrage werden die verbrauchten Tokens mitgeschrieben
-- - ai_provider_status merkt sich die letzten Limit-Angaben von Groq
--   pro Modell (Anfragen pro Tag, Tokens pro Minute) für die Anzeige
-- Im Supabase SQL-Editor einmal ausführen.
-- ============================================================

alter table public.ai_usage drop constraint if exists ai_usage_kind_check;
alter table public.ai_usage add constraint ai_usage_kind_check check (kind in ('quiz', 'coach', 'scan'));
alter table public.ai_usage add column if not exists tokens int;

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
  if p_kind not in ('quiz', 'coach', 'scan') then
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

-- Tokens der letzten Anfrage dieser Art nachtragen (nur für die Edge Functions).
create or replace function public.record_ai_tokens(p_user uuid, p_kind text, p_tokens int)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.ai_usage set tokens = coalesce(tokens, 0) + greatest(0, p_tokens)
   where id = (select id from public.ai_usage where user_id = p_user and kind = p_kind order by id desc limit 1);
$$;

revoke all on function public.consume_ai_quota(uuid, text, int, int) from public, anon, authenticated;
grant execute on function public.consume_ai_quota(uuid, text, int, int) to service_role;
revoke all on function public.record_ai_tokens(uuid, text, int) from public, anon, authenticated;
grant execute on function public.record_ai_tokens(uuid, text, int) to service_role;

-- Letzter bekannter Stand der Groq-Limits pro Modell. Gilt für alle,
-- enthält keine persönlichen Daten: alle Angemeldeten dürfen lesen,
-- schreiben darf nur der Server.
create table if not exists public.ai_provider_status (
  model text primary key,
  limit_requests int,
  remaining_requests int,
  reset_requests text,
  limit_tokens int,
  remaining_tokens int,
  reset_tokens text,
  last_status int,
  updated_at timestamptz not null default now()
);

alter table public.ai_provider_status enable row level security;
drop policy if exists "Alle Angemeldeten lesen" on public.ai_provider_status;
create policy "Alle Angemeldeten lesen" on public.ai_provider_status for select to authenticated using (true);
revoke all on public.ai_provider_status from anon, authenticated;
grant select on public.ai_provider_status to authenticated;
grant select, insert, update on public.ai_provider_status to service_role;

-- ============================================================
-- Lumo — Datenbankschema (Supabase / Postgres 15+)
--
-- Einmal komplett im Supabase SQL-Editor ausführen:
-- Dashboard → SQL Editor → New query → Inhalt einfügen → Run.
-- Das Skript ist für eine LEERE Datenbank gedacht.
--
-- Sicherheitsmodell
--   * Jede Tabelle hat Row Level Security; Nutzer sehen und ändern
--     ausschliesslich Zeilen mit ihrer eigenen user_id.
--   * Fremdschlüssel sind zusammengesetzt (id, user_id): eine Zeile kann
--     nur auf Zeilen DESSELBEN Nutzers zeigen, nie auf fremde Daten.
--   * Alle Daten hängen per ON DELETE CASCADE am Konto — wird ein Konto
--     gelöscht, verschwinden auch alle seine Daten.
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- Hilfsfunktion: updated_at automatisch setzen
-- ------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ------------------------------------------------------------
-- EINSTELLUNGEN — eine Zeile pro Nutzer
-- ------------------------------------------------------------
create table public.settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  onboarded boolean not null default false,
  updated_at timestamptz not null default now()
);

create trigger settings_set_updated_at
  before update on public.settings
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- ZIELE — z.B. "Maturaprüfung", "Führerschein Theorie", "EMS".
--   kind = 'topics': Fortschritt = erledigte Themen der zugeordneten Fächer
--   kind = 'hours' : Fortschritt = geloggte Lernstunden / target_hours
-- ------------------------------------------------------------
create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  kind text not null default 'topics' check (kind in ('topics', 'hours')),
  exam_date date,
  target_hours numeric check (target_hours is null or target_hours > 0),
  color text not null default 'ink',
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (id, user_id),
  check (kind <> 'hours' or target_hours is not null)
);

-- ------------------------------------------------------------
-- PHASEN — grosse Etappen des Plans
-- ------------------------------------------------------------
create table public.plan_phases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  start_date date not null,
  end_date date not null,
  description text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (id, user_id),
  check (end_date >= start_date)
);

-- ------------------------------------------------------------
-- FÄCHER — optional einem Ziel zugeordnet
-- ------------------------------------------------------------
create table public.plan_subjects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  goal_id uuid,
  name text not null check (length(trim(name)) > 0),
  priority text not null default 'mittel' check (priority in ('niedrig', 'mittel', 'hoch', 'sehr hoch')),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (goal_id, user_id) references public.goals(id, user_id) on delete set null (goal_id)
);

-- ------------------------------------------------------------
-- THEMEN — gehören zu einem Fach, optional zu einer Phase.
-- category gruppiert Themen innerhalb eines Fachs (z.B. "Analysis").
-- ------------------------------------------------------------
create table public.plan_topics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_id uuid not null,
  phase_id uuid,
  category text,
  title text not null check (length(trim(title)) > 0),
  done boolean not null default false,
  completed_at timestamptz,
  sort_order int not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (subject_id, user_id) references public.plan_subjects(id, user_id) on delete cascade,
  foreign key (phase_id, user_id) references public.plan_phases(id, user_id) on delete set null (phase_id)
);

-- ------------------------------------------------------------
-- UNTERTHEMEN — feinste Fortschrittseinheit eines Themas
-- ------------------------------------------------------------
create table public.plan_subtasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  topic_id uuid not null,
  title text not null check (length(trim(title)) > 0),
  is_done boolean not null default false,
  done_at timestamptz,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  foreign key (topic_id, user_id) references public.plan_topics(id, user_id) on delete cascade
);

-- ------------------------------------------------------------
-- WOCHENPLAN — Haupt- und Nebenfokus pro Woche
-- ------------------------------------------------------------
create table public.plan_weeks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  phase_id uuid,
  start_date date not null,
  end_date date not null,
  primary_subject_id uuid,
  primary_focus text,
  primary_topic_ids uuid[] not null default '{}',
  secondary_subject_id uuid,
  secondary_focus text,
  secondary_topic_ids uuid[] not null default '{}',
  note text,
  is_buffer_week boolean not null default false,
  created_at timestamptz not null default now(),
  check (end_date >= start_date),
  foreign key (phase_id, user_id) references public.plan_phases(id, user_id) on delete set null (phase_id),
  foreign key (primary_subject_id, user_id) references public.plan_subjects(id, user_id) on delete set null (primary_subject_id),
  foreign key (secondary_subject_id, user_id) references public.plan_subjects(id, user_id) on delete set null (secondary_subject_id)
);

-- ------------------------------------------------------------
-- DEADLINES — Anmeldefristen, Prüfungstage (optional Zeitraum)
-- ------------------------------------------------------------
create table public.plan_deadlines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  goal_id uuid,
  title text not null check (length(trim(title)) > 0),
  date date not null,
  end_date date,
  description text,
  critical boolean not null default false,
  created_at timestamptz not null default now(),
  check (end_date is null or end_date >= date),
  foreign key (goal_id, user_id) references public.goals(id, user_id) on delete set null (goal_id)
);

-- ------------------------------------------------------------
-- AUFGABEN
-- ------------------------------------------------------------
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  goal_id uuid,
  title text not null check (length(trim(title)) > 0),
  due_date date,
  done boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (goal_id, user_id) references public.goals(id, user_id) on delete set null (goal_id)
);

create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- TERMINE
-- ------------------------------------------------------------
create table public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  event_date timestamptz not null,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- LERN-SESSIONS (Lern-Timer)
-- ------------------------------------------------------------
create table public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  goal_id uuid,
  topic_id uuid,
  duration_seconds int not null check (duration_seconds > 0),
  created_at timestamptz not null default now(),
  foreign key (goal_id, user_id) references public.goals(id, user_id) on delete set null (goal_id),
  foreign key (topic_id, user_id) references public.plan_topics(id, user_id) on delete set null (topic_id)
);

-- ------------------------------------------------------------
-- FORTSCHRITTS-MEILENSTEINE — ein Eintrag je Ziel und 10%-Schritt
-- ------------------------------------------------------------
create table public.progress_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  goal_id uuid not null,
  pct int not null check (pct between 0 and 100),
  created_at timestamptz not null default now(),
  foreign key (goal_id, user_id) references public.goals(id, user_id) on delete cascade
);

-- ------------------------------------------------------------
-- LINKSAMMLUNG
-- ------------------------------------------------------------
create table public.links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (length(trim(category)) > 0),
  title text not null check (length(trim(title)) > 0),
  url text not null check (url ~* '^https?://'),
  description text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- INDIZES
-- ------------------------------------------------------------
create index goals_user_idx on public.goals(user_id);
create index plan_phases_user_idx on public.plan_phases(user_id);
create index plan_subjects_user_idx on public.plan_subjects(user_id);
create index plan_topics_user_idx on public.plan_topics(user_id);
create index plan_topics_subject_idx on public.plan_topics(subject_id);
create index plan_subtasks_user_idx on public.plan_subtasks(user_id);
create index plan_subtasks_topic_idx on public.plan_subtasks(topic_id);
create index plan_weeks_user_start_idx on public.plan_weeks(user_id, start_date);
create index plan_deadlines_user_date_idx on public.plan_deadlines(user_id, date);
create index tasks_user_idx on public.tasks(user_id);
create index events_user_date_idx on public.events(user_id, event_date);
create index study_sessions_user_created_idx on public.study_sessions(user_id, created_at);
create index progress_snapshots_user_goal_idx on public.progress_snapshots(user_id, goal_id, created_at);
create index links_user_idx on public.links(user_id);

-- ------------------------------------------------------------
-- ROW LEVEL SECURITY — jede Tabelle: nur eigene Zeilen
-- ------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'settings', 'goals', 'plan_phases', 'plan_subjects', 'plan_topics',
    'plan_subtasks', 'plan_weeks', 'plan_deadlines', 'tasks', 'events',
    'study_sessions', 'progress_snapshots', 'links'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "Nur eigene Zeilen" on public.%I for all to authenticated '
      'using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)',
      t
    );
  end loop;
end $$;

-- ------------------------------------------------------------
-- RECHTE — angemeldete Nutzer dürfen die Tabellen ansprechen (welche
-- Zeilen, regelt RLS oben). Nicht angemeldete (anon) bekommen nichts.
-- Ausdrücklich gesetzt, damit das Schema unabhängig von der
-- Projekt-Einstellung "Automatically expose new tables" funktioniert.
-- ------------------------------------------------------------
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke all on all tables in schema public from anon;

-- ============================================================
-- FUNKTIONEN (per supabase.rpc() aus dem Frontend aufgerufen)
-- ============================================================

-- ------------------------------------------------------------
-- import_template(template, shift_days)
-- Spielt eine Lernplan-Vorlage (JSON, siehe src/templates/) für den
-- angemeldeten Nutzer ein — in EINER Transaktion: entweder alles oder
-- nichts. shift_days verschiebt alle Datumswerte der Vorlage, damit
-- ein Plan an einem anderen Startdatum beginnen kann.
-- Läuft mit den Rechten des Aufrufers (security invoker), RLS gilt.
-- ------------------------------------------------------------
create or replace function public.import_template(template jsonb, shift_days int default 0)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_keys jsonb := '{}'::jsonb;   -- Vorlagen-Schlüssel -> neue UUID
  v_id uuid;
  v_topic uuid;
  r jsonb;
  st text;
  i int;
  v_primary uuid[];
  v_secondary uuid[];
begin
  if v_user is null then
    raise exception 'Nicht angemeldet';
  end if;

  for r in select * from jsonb_array_elements(coalesce(template->'goals', '[]'::jsonb)) loop
    insert into public.goals (user_id, name, kind, exam_date, target_hours, color, sort_order)
    values (
      v_user, r->>'name', coalesce(r->>'kind', 'topics'),
      (r->>'exam_date')::date + shift_days,
      (r->>'target_hours')::numeric,
      coalesce(r->>'color', 'ink'),
      coalesce((r->>'sort_order')::int, 0)
    ) returning id into v_id;
    v_keys := v_keys || jsonb_build_object(r->>'key', v_id);
  end loop;

  i := 0;
  for r in select * from jsonb_array_elements(coalesce(template->'phases', '[]'::jsonb)) loop
    i := i + 1;
    insert into public.plan_phases (user_id, name, start_date, end_date, description, sort_order)
    values (
      v_user, r->>'name',
      (r->>'start_date')::date + shift_days,
      (r->>'end_date')::date + shift_days,
      r->>'description', i
    ) returning id into v_id;
    v_keys := v_keys || jsonb_build_object(r->>'key', v_id);
  end loop;

  for r in select * from jsonb_array_elements(coalesce(template->'subjects', '[]'::jsonb)) loop
    insert into public.plan_subjects (user_id, goal_id, name, priority, sort_order)
    values (
      v_user, (v_keys->>(r->>'goal'))::uuid, r->>'name',
      coalesce(r->>'priority', 'mittel'), coalesce((r->>'sort_order')::int, 0)
    ) returning id into v_id;
    v_keys := v_keys || jsonb_build_object(r->>'key', v_id);
  end loop;

  for r in select * from jsonb_array_elements(coalesce(template->'topics', '[]'::jsonb)) loop
    insert into public.plan_topics (user_id, subject_id, phase_id, category, title, sort_order)
    values (
      v_user, (v_keys->>(r->>'subject'))::uuid, (v_keys->>(r->>'phase'))::uuid,
      r->>'category', r->>'title', coalesce((r->>'sort_order')::int, 0)
    ) returning id into v_topic;
    v_keys := v_keys || jsonb_build_object(r->>'key', v_topic);

    i := 0;
    for st in select * from jsonb_array_elements_text(coalesce(r->'subtasks', '[]'::jsonb)) loop
      i := i + 1;
      insert into public.plan_subtasks (user_id, topic_id, title, sort_order)
      values (v_user, v_topic, st, i);
    end loop;
  end loop;

  for r in select * from jsonb_array_elements(coalesce(template->'weeks', '[]'::jsonb)) loop
    select coalesce(array_agg((v_keys->>k)::uuid) filter (where v_keys ? k), '{}')
      into v_primary from jsonb_array_elements_text(coalesce(r->'primary_topics', '[]'::jsonb)) as k;
    select coalesce(array_agg((v_keys->>k)::uuid) filter (where v_keys ? k), '{}')
      into v_secondary from jsonb_array_elements_text(coalesce(r->'secondary_topics', '[]'::jsonb)) as k;

    insert into public.plan_weeks (
      user_id, phase_id, start_date, end_date,
      primary_subject_id, primary_focus, primary_topic_ids,
      secondary_subject_id, secondary_focus, secondary_topic_ids,
      note, is_buffer_week
    ) values (
      v_user, (v_keys->>(r->>'phase'))::uuid,
      (r->>'start_date')::date + shift_days, (r->>'end_date')::date + shift_days,
      (v_keys->>(r->>'primary_subject'))::uuid, r->>'primary_focus', v_primary,
      (v_keys->>(r->>'secondary_subject'))::uuid, r->>'secondary_focus', v_secondary,
      r->>'note', coalesce((r->>'is_buffer_week')::boolean, false)
    );
  end loop;

  for r in select * from jsonb_array_elements(coalesce(template->'deadlines', '[]'::jsonb)) loop
    insert into public.plan_deadlines (user_id, goal_id, title, date, end_date, description, critical)
    values (
      v_user, (v_keys->>(r->>'goal'))::uuid, r->>'title',
      (r->>'date')::date + shift_days, (r->>'end_date')::date + shift_days,
      r->>'description', coalesce((r->>'critical')::boolean, false)
    );
  end loop;

  for r in select * from jsonb_array_elements(coalesce(template->'links', '[]'::jsonb)) loop
    insert into public.links (user_id, category, title, url, description, sort_order)
    values (
      v_user, r->>'category', r->>'title', r->>'url', r->>'description',
      coalesce((r->>'sort_order')::int, 0)
    );
  end loop;
end;
$$;

-- ------------------------------------------------------------
-- reset_my_data() — löscht den kompletten Lernplan und alle Einträge
-- des angemeldeten Nutzers (Konto bleibt bestehen) und startet das
-- Onboarding neu.
-- ------------------------------------------------------------
create or replace function public.reset_my_data()
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Nicht angemeldet';
  end if;
  delete from public.study_sessions where user_id = v_user;
  delete from public.tasks where user_id = v_user;
  delete from public.events where user_id = v_user;
  delete from public.links where user_id = v_user;
  delete from public.plan_weeks where user_id = v_user;
  delete from public.plan_deadlines where user_id = v_user;
  delete from public.plan_subjects where user_id = v_user;   -- Themen + Unterthemen per Cascade
  delete from public.plan_phases where user_id = v_user;
  delete from public.goals where user_id = v_user;           -- Meilensteine per Cascade
  update public.settings set onboarded = false where user_id = v_user;
end;
$$;

-- ------------------------------------------------------------
-- delete_my_account() — löscht das Konto des angemeldeten Nutzers
-- endgültig. Alle Daten werden per ON DELETE CASCADE mitgelöscht.
-- security definer ist nötig, weil normale Nutzer keine Rechte auf
-- auth.users haben; die Funktion löscht ausschliesslich auth.uid().
-- ------------------------------------------------------------
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Nicht angemeldet';
  end if;
  delete from auth.users where id = v_user;
end;
$$;

revoke all on function public.import_template(jsonb, int) from public, anon;
revoke all on function public.reset_my_data() from public, anon;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.import_template(jsonb, int) to authenticated;
grant execute on function public.reset_my_data() to authenticated;
grant execute on function public.delete_my_account() to authenticated;

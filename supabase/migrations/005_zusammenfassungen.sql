-- ============================================================
-- Lumo — Migration 005: Zusammenfassungen (Lernblätter)
--
-- Aus einem Foto oder PDF schreibt Lumi ein Lernblatt: Überblick,
-- Abschnitte mit Stichpunkten, Begriffe, Formeln und Kontrollfragen.
-- Gespeichert wird nur der Text als JSON (wenige KB pro Lernblatt),
-- nie das Bild. Ein Lernblatt gehört zu einem Fach und optional zu
-- einem Thema; die Abfragen nutzen es als Grundlage.
-- Im Supabase SQL-Editor einmal ausführen.
-- ============================================================

create table if not exists public.summaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_id uuid not null,
  topic_id uuid,
  title text not null check (length(trim(title)) between 1 and 120),
  source text check (source is null or length(source) <= 160),
  content jsonb not null check (jsonb_typeof(content) = 'object' and pg_column_size(content) <= 40000),
  created_at timestamptz not null default now(),
  foreign key (subject_id, user_id) references public.plan_subjects(id, user_id) on delete cascade,
  foreign key (topic_id, user_id) references public.plan_topics(id, user_id) on delete set null (topic_id)
);

create index if not exists summaries_user_idx on public.summaries(user_id, created_at desc);
create index if not exists summaries_topic_idx on public.summaries(topic_id);
create index if not exists summaries_subject_idx on public.summaries(subject_id);

alter table public.summaries enable row level security;
drop policy if exists "Nur eigene Zeilen" on public.summaries;
create policy "Nur eigene Zeilen" on public.summaries for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.summaries to authenticated;

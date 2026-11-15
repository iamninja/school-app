-- Practice phase 3: the centre's students keep their practice progress on
-- their account (guests keep it in the browser), the teacher and parents
-- see how practice is going, and anyone can flag a question.
--
-- practice_progress: one row per student - the same shape the game keeps
--   in the browser (lib/practice-progress.ts: points, daily streak, best
--   round, mistakes pack, per-section counts), written by the game.
-- practice_answers: every answer a student gives, for the teacher's and
--   parents' views (activity per day, accuracy per section and question).
--   client_id makes a retried upload harmless.
-- practice_reports: "something's wrong with this question", from anyone
--   (inserted by the server with the service role, rate-limited there).

create table public.practice_progress (
  student_id  uuid primary key references public.students (id) on delete cascade,
  data        jsonb not null,
  updated_at  timestamptz not null default now(),
  constraint practice_progress_size check (pg_column_size(data) < 200000)
);

create table public.practice_answers (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references public.students (id) on delete cascade,
  -- Kept (as null) if the question or section is later deleted.
  question_id  uuid references public.practice_questions (id) on delete set null,
  section_id   uuid references public.practice_sections (id) on delete set null,
  correct      boolean not null,
  points       integer not null default 0 check (points between 0 and 100),
  answered_at  timestamptz not null default now(),
  client_id    text not null check (length(client_id) between 8 and 80),
  unique (student_id, client_id)
);

create index practice_answers_student_idx on public.practice_answers (student_id, answered_at desc);
create index practice_answers_question_idx on public.practice_answers (question_id) where question_id is not null;

create table public.practice_reports (
  id           uuid primary key default gen_random_uuid(),
  question_id  uuid not null references public.practice_questions (id) on delete cascade,
  -- Null for a guest.
  student_id   uuid references public.students (id) on delete set null,
  message      text check (message is null or length(message) <= 1000),
  -- The question as it was played (random numbers differ each time).
  played_prompt text check (played_prompt is null or length(played_prompt) <= 4000),
  resolved_at  timestamptz,
  created_at   timestamptz not null default now()
);

create index practice_reports_open_idx on public.practice_reports (created_at desc) where resolved_at is null;

alter table public.practice_progress enable row level security;
alter table public.practice_answers enable row level security;
alter table public.practice_reports enable row level security;

-- A student: their own rows.
create policy "Students manage own practice progress" on public.practice_progress
  using (exists (select 1 from public.students s where s.id = student_id and s.user_id = auth.uid()))
  with check (exists (select 1 from public.students s where s.id = student_id and s.user_id = auth.uid()));

create policy "Students read own practice answers" on public.practice_answers
  for select using (exists (select 1 from public.students s where s.id = student_id and s.user_id = auth.uid()));
create policy "Students record own practice answers" on public.practice_answers
  for insert with check (exists (select 1 from public.students s where s.id = student_id and s.user_id = auth.uid()));

-- Parents: their children's.
create policy "Parents view child practice progress" on public.practice_progress
  for select using (public.is_parent_of_student(student_id));
create policy "Parents view child practice answers" on public.practice_answers
  for select using (public.is_parent_of_student(student_id));

-- The teacher: everything (single-teacher deployment, as the rest of the schema).
create policy "Teachers view practice progress" on public.practice_progress
  for select using (public.is_teacher());
create policy "Teachers view practice answers" on public.practice_answers
  for select using (public.is_teacher());
create policy "Teachers manage practice reports" on public.practice_reports
  using (public.is_teacher())
  with check (public.is_teacher());

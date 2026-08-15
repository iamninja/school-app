-- Barebones optional time limit for quizzes: a teacher can set a minute
-- limit, and the student-facing take-quiz flow uses this table to know when
-- a given student started, so a countdown can survive a page refresh
-- instead of resetting to the full limit.
--
-- Idempotent / safe to re-run, matching the style of the other quiz-*.sql
-- files - the user hand-applies these against a live Supabase project.

alter table public.quizzes add column if not exists time_limit_minutes integer;

-- Records when a student first opened a timed quiz. Only written for
-- quizzes that actually have a time limit; a quiz with no limit never gets
-- a row here.
create table if not exists public.quiz_attempt_starts (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  started_at timestamptz not null default now(),
  unique (quiz_id, student_id)
);

alter table public.quiz_attempt_starts enable row level security;

-- Drop-and-recreate so this file can be re-run safely.
drop policy if exists "Students manage own quiz attempt starts" on public.quiz_attempt_starts;

-- No teacher/parent policy needed - nothing in the UI reads this table
-- except the student's own take-quiz flow.
create policy "Students manage own quiz attempt starts"
  on public.quiz_attempt_starts
  for all
  using (
    exists (
      select 1 from public.students s
      where s.id = student_id and s.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.students s
      where s.id = student_id and s.user_id = auth.uid()
    )
  );

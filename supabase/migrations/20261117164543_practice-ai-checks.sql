-- Practice: counterexample v3b - the AI check of a typed counterexample
-- (docs/practice-counterexample-plan.md, "v3").
--
-- One row per check the Claude API made: a counterexample a student typed
-- that matched none of the teacher's options. Used for the daily cap per
-- student, and shown to the teacher with the AI's sentence. Written by the
-- server (service role) only; the teacher reads them; students and parents
-- get nothing directly (the student sees the verdict in the game).
--
-- verdict: 'valid' (a counterexample), 'hypothesis_fails',
-- 'conclusion_holds' or 'invalid' (not a function / not readable / other).
-- teacher_verdict: the teacher's correction when they disagree, else null.

create table public.practice_ai_checks (
  id               uuid primary key default gen_random_uuid(),
  question_id      uuid references public.practice_questions (id) on delete cascade,
  student_id       uuid references public.students (id) on delete set null,
  typed            text not null check (char_length(typed) <= 200),
  verdict          text not null check (verdict in ('valid', 'hypothesis_fails', 'conclusion_holds', 'invalid')),
  reason           text check (reason is null or char_length(reason) <= 600),
  teacher_verdict  text check (teacher_verdict is null or teacher_verdict in ('valid', 'hypothesis_fails', 'conclusion_holds', 'invalid')),
  created_at       timestamptz not null default now()
);

-- The daily cap: a student's checks since a moment.
create index practice_ai_checks_student_idx on public.practice_ai_checks (student_id, created_at desc);
-- The console: a question's checks.
create index practice_ai_checks_question_idx on public.practice_ai_checks (question_id, created_at desc);

alter table public.practice_ai_checks enable row level security;

-- The teacher reads them and may correct a verdict (single-teacher deployment, as the rest of the schema).
create policy "Teachers view practice AI checks" on public.practice_ai_checks
  for select using (public.is_teacher());
create policy "Teachers correct practice AI checks" on public.practice_ai_checks
  for update using (public.is_teacher()) with check (public.is_teacher());

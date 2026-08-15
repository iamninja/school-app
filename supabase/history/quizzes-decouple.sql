-- Decouples quizzes from a single hard-bound class. Previously quizzes.class_id
-- was required, so a quiz could only ever belong to the one class it was
-- created for. This introduces quiz_assignments as a many-to-many join
-- table between quizzes and classes, so a quiz can be created unassigned,
-- assigned to multiple classes over time (reuse across terms), and
-- unassigned from a class without deleting it.
--
-- Idempotent / safe to re-run, matching the style of quizzes.sql and
-- parent-rls.sql - the user hand-applies these files against a live
-- Supabase project.

create table if not exists public.quiz_assignments (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  unique (quiz_id, class_id)
);

alter table public.quiz_assignments enable row level security;

-- Drop the class_id-dependent policies before the column they depend on
-- goes away.
drop policy if exists "Students view assigned quizzes" on public.quizzes;
drop policy if exists "Students view assigned quiz questions" on public.quiz_questions;
drop policy if exists "Students view assigned quiz question options" on public.quiz_question_options;
drop policy if exists "Parents view child quizzes" on public.quizzes;

-- Backfill quiz_assignments from the existing class_id column before it's
-- dropped. Guarded so this file can be re-run after the column is already
-- gone (a second run just no-ops here).
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'quizzes'
      and column_name = 'class_id'
  ) then
    insert into public.quiz_assignments (quiz_id, class_id)
    select id, class_id from public.quizzes where class_id is not null
    on conflict (quiz_id, class_id) do nothing;
  end if;
end $$;

alter table public.quizzes drop column if exists class_id;

-- Non-recursive helpers, same SECURITY DEFINER pattern as
-- is_student_of_class / is_parent_of_class (quizzes.sql / parent-rls.sql).
-- quiz_assignments itself still carries class_id directly, so its own
-- policies below reuse those two helpers unchanged. These new helpers are
-- for quizzes/quiz_questions/quiz_question_options, which no longer carry
-- a class_id of their own now that a quiz can span multiple classes.
create or replace function public.is_quiz_assigned_to_student(quiz_id_param uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.quiz_assignments qa
    join public.student_class_assignments sca on sca.class_id = qa.class_id
    join public.students s on s.id = sca.student_id
    where qa.quiz_id = quiz_id_param
      and s.user_id = auth.uid()
  );
$$;

create or replace function public.is_quiz_assigned_to_parent(quiz_id_param uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.quiz_assignments qa
    join public.student_class_assignments sca on sca.class_id = qa.class_id
    join public.student_parents sp on sp.student_id = sca.student_id
    where qa.quiz_id = quiz_id_param
      and sp.user_id = auth.uid()
  );
$$;

revoke all on function public.is_quiz_assigned_to_student(uuid) from public;
revoke all on function public.is_quiz_assigned_to_parent(uuid) from public;
grant execute on function public.is_quiz_assigned_to_student(uuid) to authenticated;
grant execute on function public.is_quiz_assigned_to_parent(uuid) to authenticated;

-- Drop-and-recreate so this file can be re-run safely.
drop policy if exists "Teachers manage quiz assignments" on public.quiz_assignments;
drop policy if exists "Students view own class quiz assignments" on public.quiz_assignments;
drop policy if exists "Parents view child class quiz assignments" on public.quiz_assignments;

-- Teachers: full CRUD on assignments for quizzes they own. Matches the
-- ownership-via-join pattern "Teachers manage quiz questions" already uses
-- in quizzes.sql.
create policy "Teachers manage quiz assignments"
  on public.quiz_assignments
  for all
  using (
    exists (
      select 1 from public.quizzes q
      where q.id = quiz_id and q.teacher_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.quizzes q
      where q.id = quiz_id and q.teacher_id = auth.uid()
    )
  );

-- Students/parents: read-only visibility into assignments for their own
-- class(es) - lets the dashboards resolve "which classes is this quiz
-- assigned to" without needing broader access to quiz_assignments.
create policy "Students view own class quiz assignments"
  on public.quiz_assignments
  for select
  using (public.is_student_of_class(class_id));

create policy "Parents view child class quiz assignments"
  on public.quiz_assignments
  for select
  using (public.is_parent_of_class(class_id));

-- Recreate the policies dropped above, now routed through quiz_assignments
-- instead of the removed quizzes.class_id column.
create policy "Students view assigned quizzes"
  on public.quizzes
  for select
  using (public.is_quiz_assigned_to_student(id));

create policy "Students view assigned quiz questions"
  on public.quiz_questions
  for select
  using (public.is_quiz_assigned_to_student(quiz_id));

create policy "Students view assigned quiz question options"
  on public.quiz_question_options
  for select
  using (
    exists (
      select 1 from public.quiz_questions qq
      where qq.id = question_id and public.is_quiz_assigned_to_student(qq.quiz_id)
    )
  );

create policy "Parents view child quizzes"
  on public.quizzes
  for select
  using (public.is_quiz_assigned_to_parent(id));

-- Teacher policies on quizzes/quiz_questions/quiz_question_options/
-- quiz_attempts/quiz_attempt_answers are untouched by this migration - they
-- key off quizzes.teacher_id, never class_id, so they still apply as
-- created in quizzes.sql.

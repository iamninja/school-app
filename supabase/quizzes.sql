-- Quizzes/tests feature: teachers create quizzes tied to a class, students
-- take them (single attempt), results are visible to the teacher, the
-- student themselves, and their parent (mirroring attendance visibility).
--
-- Multiple choice and true/false are auto-graded at submission. True/false
-- is stored as a 2-row option set on quiz_question_options rather than a
-- separate mechanism, so grading logic is identical for both types - the
-- UI auto-generates the "True"/"False" rows so the teacher never types
-- them. Short answer questions can be authored and answered now, but
-- points_awarded stays null until a future manual-grading workflow exists;
-- that's a query against quiz_attempt_answers for
-- (text_answer is not null and is_correct is null), not a schema change.

create table if not exists public.quizzes (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  title text not null,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  question_text text not null,
  question_type text not null check (
    question_type in ('multiple_choice', 'true_false', 'short_answer')
  ),
  order_index integer not null default 0,
  points integer not null default 1 check (points > 0),
  created_at timestamptz not null default now()
);

create table if not exists public.quiz_question_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.quiz_questions(id) on delete cascade,
  option_text text not null,
  is_correct boolean not null default false,
  order_index integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  submitted_at timestamptz not null default now(),
  score numeric(10,2) not null default 0,
  -- Single attempt per student per quiz for now. Adding multiple attempts
  -- later means dropping this constraint and adding an attempt_number
  -- column, not a redesign.
  unique (quiz_id, student_id)
);

create table if not exists public.quiz_attempt_answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.quiz_attempts(id) on delete cascade,
  question_id uuid not null references public.quiz_questions(id) on delete cascade,
  selected_option_id uuid references public.quiz_question_options(id) on delete set null,
  text_answer text,
  -- null = not auto-graded (i.e. a short-answer response awaiting review).
  is_correct boolean,
  points_awarded numeric(10,2),
  created_at timestamptz not null default now()
);

alter table public.quizzes enable row level security;
alter table public.quiz_questions enable row level security;
alter table public.quiz_question_options enable row level security;
alter table public.quiz_attempts enable row level security;
alter table public.quiz_attempt_answers enable row level security;

-- Non-recursive helper, same shape and rationale as is_parent_of_student /
-- is_parent_of_class in parent-rls.sql: SECURITY DEFINER means the query
-- inside runs as the function owner, bypassing RLS on the tables it
-- touches, so it can never trigger the recursion that a plain
-- cross-table policy subquery risks.
create or replace function public.is_student_of_class(class_id_param uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.student_class_assignments sca
    join public.students s on s.id = sca.student_id
    where sca.class_id = class_id_param
      and s.user_id = auth.uid()
  );
$$;

revoke all on function public.is_student_of_class(uuid) from public;
grant execute on function public.is_student_of_class(uuid) to authenticated;

-- Drop-and-recreate so this file can be re-run safely.
drop policy if exists "Teachers manage quizzes" on public.quizzes;
drop policy if exists "Teachers manage quiz questions" on public.quiz_questions;
drop policy if exists "Teachers manage quiz question options" on public.quiz_question_options;
drop policy if exists "Teachers manage quiz attempts" on public.quiz_attempts;
drop policy if exists "Teachers manage quiz attempt answers" on public.quiz_attempt_answers;
drop policy if exists "Students view assigned quizzes" on public.quizzes;
drop policy if exists "Students view assigned quiz questions" on public.quiz_questions;
drop policy if exists "Students view assigned quiz question options" on public.quiz_question_options;
drop policy if exists "Students create own quiz attempts" on public.quiz_attempts;
drop policy if exists "Students view own quiz attempts" on public.quiz_attempts;
drop policy if exists "Students create own quiz attempt answers" on public.quiz_attempt_answers;
drop policy if exists "Students view own quiz attempt answers" on public.quiz_attempt_answers;
drop policy if exists "Parents view child quizzes" on public.quizzes;
drop policy if exists "Parents view child quiz attempts" on public.quiz_attempts;
drop policy if exists "Parents view child quiz attempt answers" on public.quiz_attempt_answers;

-- Teachers: full CRUD, scoped by ownership. Matches "Teachers manage
-- classes"/"Teachers manage attendance" in teacher-dashboard.sql exactly
-- for quizzes itself; the child tables join back up to quizzes.teacher_id
-- the same way "Teachers manage parents" joins back up to students.teacher_id.

create policy "Teachers manage quizzes"
  on public.quizzes
  for all
  using (teacher_id = auth.uid())
  with check (teacher_id = auth.uid());

create policy "Teachers manage quiz questions"
  on public.quiz_questions
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

create policy "Teachers manage quiz question options"
  on public.quiz_question_options
  for all
  using (
    exists (
      select 1
      from public.quiz_questions qq
      join public.quizzes q on q.id = qq.quiz_id
      where qq.id = question_id and q.teacher_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.quiz_questions qq
      join public.quizzes q on q.id = qq.quiz_id
      where qq.id = question_id and q.teacher_id = auth.uid()
    )
  );

create policy "Teachers manage quiz attempts"
  on public.quiz_attempts
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

create policy "Teachers manage quiz attempt answers"
  on public.quiz_attempt_answers
  for all
  using (
    exists (
      select 1
      from public.quiz_attempts qa
      join public.quizzes q on q.id = qa.quiz_id
      where qa.id = attempt_id and q.teacher_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.quiz_attempts qa
      join public.quizzes q on q.id = qa.quiz_id
      where qa.id = attempt_id and q.teacher_id = auth.uid()
    )
  );

-- Students: read-only access to quizzes/questions/options for classes
-- they're assigned to (RLS is row-level, not column-level - the "never
-- reveal is_correct before submission" guarantee is enforced by the
-- server action's explicit column selection, not by RLS). Write access
-- limited to inserting their own attempts.

create policy "Students view assigned quizzes"
  on public.quizzes
  for select
  using (public.is_student_of_class(class_id));

create policy "Students view assigned quiz questions"
  on public.quiz_questions
  for select
  using (
    exists (
      select 1 from public.quizzes q
      where q.id = quiz_id and public.is_student_of_class(q.class_id)
    )
  );

create policy "Students view assigned quiz question options"
  on public.quiz_question_options
  for select
  using (
    exists (
      select 1
      from public.quiz_questions qq
      join public.quizzes q on q.id = qq.quiz_id
      where qq.id = question_id and public.is_student_of_class(q.class_id)
    )
  );

create policy "Students create own quiz attempts"
  on public.quiz_attempts
  for insert
  with check (
    exists (
      select 1 from public.students s
      where s.id = student_id and s.user_id = auth.uid()
    )
  );

create policy "Students view own quiz attempts"
  on public.quiz_attempts
  for select
  using (
    exists (
      select 1 from public.students s
      where s.id = student_id and s.user_id = auth.uid()
    )
  );

create policy "Students create own quiz attempt answers"
  on public.quiz_attempt_answers
  for insert
  with check (
    exists (
      select 1
      from public.quiz_attempts qa
      join public.students s on s.id = qa.student_id
      where qa.id = attempt_id and s.user_id = auth.uid()
    )
  );

create policy "Students view own quiz attempt answers"
  on public.quiz_attempt_answers
  for select
  using (
    exists (
      select 1
      from public.quiz_attempts qa
      join public.students s on s.id = qa.student_id
      where qa.id = attempt_id and s.user_id = auth.uid()
    )
  );

-- Parents: read-only, matching the attendance visibility model - quiz
-- title + score, not a full question-by-question breakdown (that stays
-- between the student and their own review view). Reuses the existing
-- is_parent_of_class/is_parent_of_student helpers from parent-rls.sql.

create policy "Parents view child quizzes"
  on public.quizzes
  for select
  using (public.is_parent_of_class(class_id));

create policy "Parents view child quiz attempts"
  on public.quiz_attempts
  for select
  using (public.is_parent_of_student(student_id));

create policy "Parents view child quiz attempt answers"
  on public.quiz_attempt_answers
  for select
  using (
    exists (
      select 1 from public.quiz_attempts qa
      where qa.id = attempt_id and public.is_parent_of_student(qa.student_id)
    )
  );

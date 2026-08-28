-- Let students retake a quiz, up to a configurable (or unlimited) number of
-- tries, per assignment (mirrors shuffle_questions - the same quiz can
-- allow more/fewer tries for one class than another).
--
-- Explicit product decision: only two attempts are ever kept in full detail
-- - the first ("official", quiz_attempts - unchanged, still the row every
-- existing teacher/student/parent view reads) and the best-scoring one so
-- far (quiz_attempt_bests/quiz_attempt_best_answers, new below). A retry
-- that doesn't beat the current best has its answers discarded entirely,
-- never written anywhere.
alter table public.quiz_assignments
  add column if not exists max_attempts integer;

-- Existing/new rows default to 1 (today's "one attempt ever" behavior)
-- unless a teacher explicitly raises it or sets it to unlimited (null).
update public.quiz_assignments set max_attempts = 1 where max_attempts is null;

alter table public.quiz_assignments
  alter column max_attempts set default 1;

alter table public.quiz_assignments
  add constraint quiz_assignments_max_attempts_check
  check (max_attempts is null or max_attempts > 0);

-- One row per official attempt (attempt_id is both the FK and the PK, so
-- this can never diverge into more than one "best" per (quiz, student)).
-- Replaced in place whenever a later retry beats the current score/answers
-- - never a new row per retry.
create table public.quiz_attempt_bests (
  attempt_id uuid primary key references public.quiz_attempts (id) on delete cascade,
  score numeric(10, 2) not null,
  submitted_at timestamp with time zone not null default now(),
  attempts_used integer not null default 1
);

alter table public.quiz_attempt_bests enable row level security;

grant all on public.quiz_attempt_bests to anon;

grant all on public.quiz_attempt_bests to authenticated;

grant all on public.quiz_attempt_bests to service_role;

create policy "Students manage own quiz attempt bests" on public.quiz_attempt_bests
  for all
  using (
    exists (
      select 1
      from public.quiz_attempts qa
      join public.students s on s.id = qa.student_id
      where qa.id = quiz_attempt_bests.attempt_id
        and s.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.quiz_attempts qa
      join public.students s on s.id = qa.student_id
      where qa.id = quiz_attempt_bests.attempt_id
        and s.user_id = auth.uid()
    )
  );

create policy "Teachers manage quiz attempt bests" on public.quiz_attempt_bests
  for all
  using (
    exists (
      select 1
      from public.quiz_attempts qa
      join public.quizzes q on q.id = qa.quiz_id
      where qa.id = quiz_attempt_bests.attempt_id
        and q.teacher_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.quiz_attempts qa
      join public.quizzes q on q.id = qa.quiz_id
      where qa.id = quiz_attempt_bests.attempt_id
        and q.teacher_id = auth.uid()
    )
  );

create policy "Parents view child quiz attempt bests" on public.quiz_attempt_bests
  for select
  using (
    exists (
      select 1
      from public.quiz_attempts qa
      where qa.id = quiz_attempt_bests.attempt_id
        and public.is_parent_of_student(qa.student_id)
    )
  );

-- Mirrors quiz_attempt_answers' shape exactly, but holds only the current
-- best attempt's answer detail - wiped and re-inserted whenever a retry
-- replaces quiz_attempt_bests' score.
create table public.quiz_attempt_best_answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.quiz_attempt_bests (attempt_id) on delete cascade,
  question_id uuid not null references public.quiz_questions (id) on delete cascade,
  selected_option_id uuid references public.quiz_question_options (id) on delete set null,
  text_answer text,
  is_correct boolean,
  points_awarded numeric(10, 2),
  created_at timestamp with time zone not null default now()
);

alter table public.quiz_attempt_best_answers enable row level security;

grant all on public.quiz_attempt_best_answers to anon;

grant all on public.quiz_attempt_best_answers to authenticated;

grant all on public.quiz_attempt_best_answers to service_role;

create policy "Students manage own quiz attempt best answers" on public.quiz_attempt_best_answers
  for all
  using (
    exists (
      select 1
      from public.quiz_attempts qa
      join public.students s on s.id = qa.student_id
      where qa.id = quiz_attempt_best_answers.attempt_id
        and s.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.quiz_attempts qa
      join public.students s on s.id = qa.student_id
      where qa.id = quiz_attempt_best_answers.attempt_id
        and s.user_id = auth.uid()
    )
  );

create policy "Teachers manage quiz attempt best answers" on public.quiz_attempt_best_answers
  for all
  using (
    exists (
      select 1
      from public.quiz_attempts qa
      join public.quizzes q on q.id = qa.quiz_id
      where qa.id = quiz_attempt_best_answers.attempt_id
        and q.teacher_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.quiz_attempts qa
      join public.quizzes q on q.id = qa.quiz_id
      where qa.id = quiz_attempt_best_answers.attempt_id
        and q.teacher_id = auth.uid()
    )
  );

create policy "Parents view child quiz attempt best answers" on public.quiz_attempt_best_answers
  for select
  using (
    exists (
      select 1
      from public.quiz_attempts qa
      where qa.id = quiz_attempt_best_answers.attempt_id
        and public.is_parent_of_student(qa.student_id)
    )
  );

-- Resolves the effective retry limit for the calling student, across every
-- one of their classes this quiz is assigned to. Mirrors
-- is_quiz_shuffled_for_student's join shape/permissive-OR resolution: if
-- any assignment grants unlimited (null), unlimited wins; otherwise the
-- most generous (highest) finite limit among them applies.
create function public.quiz_max_attempts_for_student (
  quiz_id_param uuid
)
  returns integer
  language sql
  stable
  security definer
  set search_path to 'public'
  as $function$
  select case
    when bool_or(qa.max_attempts is null) then null
    else max(qa.max_attempts)
  end
  from public.quiz_assignments qa
  join public.student_class_assignments sca on sca.class_id = qa.class_id
  join public.students s on s.id = sca.student_id
  where qa.quiz_id = quiz_id_param
    and s.user_id = auth.uid();
$function$;

revoke all on function public.quiz_max_attempts_for_student(uuid) from public;

grant all on function public.quiz_max_attempts_for_student(uuid) to anon;

grant all on function public.quiz_max_attempts_for_student(uuid) to authenticated;

grant all on function public.quiz_max_attempts_for_student(uuid) to service_role;

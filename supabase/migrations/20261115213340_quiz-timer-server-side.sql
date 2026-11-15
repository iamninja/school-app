-- The quiz time limit, enforced by the server rather than the student's
-- device, and a quiz's questions kept closed until the student starts it.
--
-- Before: students could insert/update/delete their own
-- quiz_attempt_starts row (the timer's start time), so they could restart
-- the timer; nothing checked the limit on submission; and the questions
-- and options of any assigned quiz were readable straight from PostgREST
-- before opening it (when the timer starts), so answers could be prepared
-- in advance.
--
-- After:
-- - quiz_attempt_starts is written by the server only
--   (app/student-dashboard/quiz-actions.ts, service role); students read
--   their own rows.
-- - On submission the server works out how late a timed quiz was handed
--   in. Past a short grace it's still accepted (no work lost to a sleeping
--   laptop) and stored as late_by_seconds, which the teacher sees.
-- - A student sees a quiz's questions and options once they have started
--   it or handed it in; a parent once their child has handed it in. Quiz
--   images follow the same rule.
-- - The portals' "x / max" totals come from quiz_max_scores(), which
--   returns only the totals.
--
-- Deploy order: the app change first, then this migration.

alter table public.quiz_attempts
  add column late_by_seconds integer check (late_by_seconds is null or late_by_seconds > 0);
comment on column public.quiz_attempts.late_by_seconds is
  'Timed quizzes: how long after the time limit (plus grace) this first attempt was handed in; null when on time or untimed.';

alter table public.quiz_attempt_bests
  add column late_by_seconds integer check (late_by_seconds is null or late_by_seconds > 0);
comment on column public.quiz_attempt_bests.late_by_seconds is
  'Same as quiz_attempts.late_by_seconds, for the attempt that holds the best score.';

-- The timer's start time: the server's.
drop policy "Students manage own quiz attempt starts" on public.quiz_attempt_starts;
create policy "Students view own quiz attempt starts" on public.quiz_attempt_starts
  for select using (exists (
    select 1 from public.students s
    where s.id = quiz_attempt_starts.student_id and s.user_id = auth.uid()
  ));

-- A quiz is open to a student once they've started it or handed it in.
create function public.is_quiz_open_to_student(quiz_id_param uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path to 'public'
as $$
  select public.is_quiz_assigned_to_student(quiz_id_param)
    and exists (
      select 1
      from public.students s
      where s.user_id = auth.uid()
        and (
          exists (select 1 from public.quiz_attempt_starts st where st.quiz_id = quiz_id_param and st.student_id = s.id)
          or exists (select 1 from public.quiz_attempts qa where qa.quiz_id = quiz_id_param and qa.student_id = s.id)
        )
    );
$$;

-- ...and to a parent once one of their children has handed it in.
create function public.is_quiz_open_to_parent(quiz_id_param uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path to 'public'
as $$
  select public.is_quiz_assigned_to_parent(quiz_id_param)
    and exists (
      select 1
      from public.quiz_attempts qa
      join public.students s on s.id = qa.student_id
      join public.family_parents fp on fp.family_id = s.family_id
      where qa.quiz_id = quiz_id_param and fp.user_id = auth.uid()
    );
$$;

revoke all on function public.is_quiz_open_to_student(uuid) from public;
revoke all on function public.is_quiz_open_to_parent(uuid) from public;
grant execute on function public.is_quiz_open_to_student(uuid) to anon, authenticated, service_role;
grant execute on function public.is_quiz_open_to_parent(uuid) to anon, authenticated, service_role;

drop policy "Students view assigned quiz questions" on public.quiz_questions;
create policy "Students view started quiz questions" on public.quiz_questions
  for select using (public.is_quiz_open_to_student(quiz_id));

drop policy "Parents view child quiz questions" on public.quiz_questions;
create policy "Parents view handed-in quiz questions" on public.quiz_questions
  for select using (public.is_quiz_open_to_parent(quiz_id));

drop policy "Students view assigned quiz question options" on public.quiz_question_options;
create policy "Students view started quiz question options" on public.quiz_question_options
  for select using (exists (
    select 1 from public.quiz_questions qq
    where qq.id = quiz_question_options.question_id
      and public.is_quiz_open_to_student(qq.quiz_id)
  ));

create or replace function public.is_quiz_image_visible(object_name text)
  returns boolean
  language sql
  stable
  security definer
  set search_path to 'public'
as $$
  select exists (
    select 1
    from public.quiz_questions qq
    join public.quizzes qz on qz.id = qq.quiz_id
    where qq.image_path = object_name
      and (
        qz.teacher_id = auth.uid()
        or public.is_quiz_open_to_student(qz.id)
        or public.is_quiz_open_to_parent(qz.id)
      )
  );
$$;

-- The portals' "x / max": each quiz's total points, for quizzes assigned
-- to the caller (student) or their children (parent), without the questions.
create function public.quiz_max_scores(quiz_ids uuid[])
  returns table (quiz_id uuid, max_score bigint)
  language sql
  stable
  security definer
  set search_path to 'public'
as $$
  select qq.quiz_id, sum(qq.points)::bigint
  from public.quiz_questions qq
  where qq.quiz_id = any(quiz_ids)
    and (public.is_quiz_assigned_to_student(qq.quiz_id) or public.is_quiz_assigned_to_parent(qq.quiz_id))
  group by qq.quiz_id;
$$;

revoke all on function public.quiz_max_scores(uuid[]) from public, anon;
grant execute on function public.quiz_max_scores(uuid[]) to authenticated, service_role;

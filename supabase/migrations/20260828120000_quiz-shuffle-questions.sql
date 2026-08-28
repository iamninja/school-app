-- Let a teacher shuffle question order per quiz assignment. This is an
-- attribute of the assignment (quiz_assignments), not the quiz itself, so
-- the same quiz can be shuffled for one class and not another.
alter table public.quiz_assignments
  add column if not exists shuffle_questions boolean not null default false;

-- Stable per-student question order, so a shuffled quiz doesn't re-shuffle
-- itself on every resume/refresh. Reuses quiz_attempt_starts since it's
-- already the per-(quiz,student) anchor row for "this student has begun
-- this quiz".
alter table public.quiz_attempt_starts
  add column if not exists question_order jsonb;

-- Security definer so a student can check the shuffle setting for a quiz
-- without needing direct SELECT access to quiz_assignments/other students'
-- class rosters. Mirrors is_quiz_assigned_to_student's join shape. A quiz
-- assigned to more than one of the student's classes with different
-- settings shuffles if any of them does.
create function public.is_quiz_shuffled_for_student (
  quiz_id_param uuid
)
  returns boolean
  language sql
  stable
  security definer
  set search_path to 'public'
  as $function$
  select coalesce(bool_or(qa.shuffle_questions), false)
  from public.quiz_assignments qa
  join public.student_class_assignments sca on sca.class_id = qa.class_id
  join public.students s on s.id = sca.student_id
  where qa.quiz_id = quiz_id_param
    and s.user_id = auth.uid();
$function$;

revoke all on function public.is_quiz_shuffled_for_student(uuid) from public;

grant all on function public.is_quiz_shuffled_for_student(uuid) to anon;

grant all on function public.is_quiz_shuffled_for_student(uuid) to authenticated;

grant all on function public.is_quiz_shuffled_for_student(uuid) to service_role;

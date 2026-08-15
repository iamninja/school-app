-- Harden every "Teachers manage X" RLS policy with an explicit is_teacher()
-- check. Ownership (teacher_id = auth.uid()) already scopes data correctly,
-- but a student/parent account that bypassed the app-layer requireTeacher()
-- gate could otherwise write rows under their own auth.uid(). This closes
-- that gap at the database layer.

create or replace function public.is_teacher()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from public.teachers where user_id = auth.uid());
$$;

revoke all on function public.is_teacher() from public;
grant execute on function public.is_teacher() to authenticated;

drop policy if exists "Teachers manage attendance" on public.attendance_records;
create policy "Teachers manage attendance" on public.attendance_records
  using ((teacher_id = auth.uid()) and public.is_teacher())
  with check ((teacher_id = auth.uid()) and public.is_teacher());

drop policy if exists "Teachers manage schedules" on public.class_schedule_slots;
create policy "Teachers manage schedules" on public.class_schedule_slots
  using ((teacher_id = auth.uid()) and public.is_teacher())
  with check ((teacher_id = auth.uid()) and public.is_teacher());

drop policy if exists "Teachers manage classes" on public.classes;
create policy "Teachers manage classes" on public.classes
  using ((teacher_id = auth.uid()) and public.is_teacher())
  with check ((teacher_id = auth.uid()) and public.is_teacher());

drop policy if exists "Teachers manage families" on public.families;
create policy "Teachers manage families" on public.families
  using ((teacher_id = auth.uid()) and public.is_teacher())
  with check ((teacher_id = auth.uid()) and public.is_teacher());

drop policy if exists "Teachers manage parents" on public.family_parents;
create policy "Teachers manage parents" on public.family_parents
  using ((exists (select 1
    from public.families f
    where f.id = family_parents.family_id and f.teacher_id = auth.uid())) and public.is_teacher())
  with check ((exists (select 1
    from public.families f
    where f.id = family_parents.family_id and f.teacher_id = auth.uid())) and public.is_teacher());

drop policy if exists "Teachers manage quiz assignments" on public.quiz_assignments;
create policy "Teachers manage quiz assignments" on public.quiz_assignments
  using ((exists (select 1
    from public.quizzes q
    where q.id = quiz_assignments.quiz_id and q.teacher_id = auth.uid())) and public.is_teacher())
  with check ((exists (select 1
    from public.quizzes q
    where q.id = quiz_assignments.quiz_id and q.teacher_id = auth.uid())) and public.is_teacher());

drop policy if exists "Teachers manage quiz attempt answers" on public.quiz_attempt_answers;
create policy "Teachers manage quiz attempt answers" on public.quiz_attempt_answers
  using ((exists (select 1
    from public.quiz_attempts qa
    join public.quizzes q on q.id = qa.quiz_id
    where qa.id = quiz_attempt_answers.attempt_id and q.teacher_id = auth.uid())) and public.is_teacher())
  with check ((exists (select 1
    from public.quiz_attempts qa
    join public.quizzes q on q.id = qa.quiz_id
    where qa.id = quiz_attempt_answers.attempt_id and q.teacher_id = auth.uid())) and public.is_teacher());

drop policy if exists "Teachers manage quiz attempts" on public.quiz_attempts;
create policy "Teachers manage quiz attempts" on public.quiz_attempts
  using ((exists (select 1
    from public.quizzes q
    where q.id = quiz_attempts.quiz_id and q.teacher_id = auth.uid())) and public.is_teacher())
  with check ((exists (select 1
    from public.quizzes q
    where q.id = quiz_attempts.quiz_id and q.teacher_id = auth.uid())) and public.is_teacher());

drop policy if exists "Teachers manage quiz question options" on public.quiz_question_options;
create policy "Teachers manage quiz question options" on public.quiz_question_options
  using ((exists (select 1
    from public.quiz_questions qq
    join public.quizzes q on q.id = qq.quiz_id
    where qq.id = quiz_question_options.question_id and q.teacher_id = auth.uid())) and public.is_teacher())
  with check ((exists (select 1
    from public.quiz_questions qq
    join public.quizzes q on q.id = qq.quiz_id
    where qq.id = quiz_question_options.question_id and q.teacher_id = auth.uid())) and public.is_teacher());

drop policy if exists "Teachers manage quiz questions" on public.quiz_questions;
create policy "Teachers manage quiz questions" on public.quiz_questions
  using ((exists (select 1
    from public.quizzes q
    where q.id = quiz_questions.quiz_id and q.teacher_id = auth.uid())) and public.is_teacher())
  with check ((exists (select 1
    from public.quizzes q
    where q.id = quiz_questions.quiz_id and q.teacher_id = auth.uid())) and public.is_teacher());

drop policy if exists "Teachers manage quizzes" on public.quizzes;
create policy "Teachers manage quizzes" on public.quizzes
  using ((teacher_id = auth.uid()) and public.is_teacher())
  with check ((teacher_id = auth.uid()) and public.is_teacher());

drop policy if exists "Teachers manage student classes" on public.student_class_assignments;
create policy "Teachers manage student classes" on public.student_class_assignments
  using ((exists (select 1
    from public.students s
    where s.id = student_class_assignments.student_id and s.teacher_id = auth.uid())) and public.is_teacher())
  with check ((exists (select 1
    from public.students s
    where s.id = student_class_assignments.student_id and s.teacher_id = auth.uid())) and public.is_teacher());

drop policy if exists "Teachers manage students" on public.students;
create policy "Teachers manage students" on public.students
  using ((teacher_id = auth.uid()) and public.is_teacher())
  with check ((teacher_id = auth.uid()) and public.is_teacher());

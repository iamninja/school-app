-- Quiz scores are written by the server only.
--
-- Students could insert their own quiz_attempts / quiz_attempt_answers and
-- insert, update or delete their own quiz_attempt_bests /
-- quiz_attempt_best_answers. The app only ever wrote the server-graded
-- result, but RLS is the boundary, not the app: with their own session a
-- student could call PostgREST directly and hand in a first attempt with
-- any score, add answers marked right, or raise their best score
-- (tests/rls/student-data-rls.test.ts).
--
-- submitQuizAttemptAction (app/student-dashboard/quiz-actions.ts) now
-- writes these four tables with the service role, after its RLS-scoped
-- check that the quiz is assigned to the student. Students keep reading
-- their own rows; parents and the teacher are unchanged.
--
-- Deploy order: the app change first (it works with or without these
-- policies), then this migration.

drop policy "Students create own quiz attempts" on public.quiz_attempts;
drop policy "Students create own quiz attempt answers" on public.quiz_attempt_answers;

drop policy "Students manage own quiz attempt bests" on public.quiz_attempt_bests;
create policy "Students view own quiz attempt bests" on public.quiz_attempt_bests
  for select using (exists (
    select 1 from public.quiz_attempts qa
    join public.students s on s.id = qa.student_id
    where qa.id = quiz_attempt_bests.attempt_id and s.user_id = auth.uid()
  ));

drop policy "Students manage own quiz attempt best answers" on public.quiz_attempt_best_answers;
create policy "Students view own quiz attempt best answers" on public.quiz_attempt_best_answers
  for select using (exists (
    select 1 from public.quiz_attempts qa
    join public.students s on s.id = qa.student_id
    where qa.id = quiz_attempt_best_answers.attempt_id and s.user_id = auth.uid()
  ));

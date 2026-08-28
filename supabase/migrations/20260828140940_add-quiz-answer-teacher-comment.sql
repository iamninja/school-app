-- Optional free-text feedback a teacher can leave on any one answer,
-- independent of grading - visible to the student/parent alongside the
-- answer via quiz-review-answers.tsx. quiz_attempt_best_answers mirrors
-- quiz_attempt_answers' shape (see 20260828130000_quiz-retakes.sql) and
-- gets its own copy of the column since a retake's best-attempt answer is
-- a separate row that may warrant a different comment than the official
-- attempt's.
alter table public.quiz_attempt_answers
  add column if not exists teacher_comment text;

alter table public.quiz_attempt_best_answers
  add column if not exists teacher_comment text;

-- AI-assisted grading for short-answer quiz questions.
--
-- model_answer is an optional teacher-authored reference for a
-- short_answer question, used to grade against when present (falls back
-- to judging from question_text alone when null).
alter table public.quiz_questions
  add column model_answer text;

-- graded_by/ai_reasoning only exist on quiz_attempt_answers (the official,
-- first-submission record) - that's the only row the teacher's pending
-- grading panel reads from today, so it's the only place provenance needs
-- tracking. quiz_attempt_best_answers still gets is_correct/points_awarded
-- written by the AI so retry scores stay correct, just without this.
alter table public.quiz_attempt_answers
  add column graded_by text check (graded_by in ('teacher', 'ai')),
  add column ai_reasoning text;

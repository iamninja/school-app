-- AI-generated explanation of why the correct answer is correct, shown
-- when a student got a multiple_choice/true_false question wrong. Unlike
-- graded_by/ai_reasoning (short-answer grading, official row only), this
-- is purely informational and never affects scoring, so it's tracked on
-- both the official and best-attempt answer rows - both are equally
-- displayed in review views.
alter table public.quiz_attempt_answers
  add column ai_explanation text;

alter table public.quiz_attempt_best_answers
  add column ai_explanation text;

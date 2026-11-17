-- Practice: the counterexample question type (docs/practice-counterexample-plan.md).
--
-- A claim the student marks Αληθής/Ψευδής; for a false claim they then pick
-- the counterexample. answer is 'true'/'false' (is the claim true?); a false
-- claim has 2 to 6 options, each {text, correct, marker, reason}: marker 'x'
-- the counterexample (the one correct option), 'h' the hypothesis fails,
-- 'c' the conclusion holds, '' wrong for another reason. A true claim has
-- no options.
--
-- practice_answers.detail keeps what went wrong in a counterexample answer,
-- for the teacher: 'claim' (true/false wrong), or the marker of a wrong
-- pick - 'h', 'c' or 'other'. Null for every other answer.

alter table public.practice_questions drop constraint practice_questions_type_check;
alter table public.practice_questions add constraint practice_questions_type_check
  check (type in ('choice', 'true_false', 'number', 'slider', 'point', 'counterexample'));

alter table public.practice_questions drop constraint practice_questions_shape;
alter table public.practice_questions add constraint practice_questions_shape check (
  (type = 'choice' and options is not null and jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 2 and 6)
  or (type = 'true_false' and answer in ('true', 'false'))
  or (type = 'number' and answer is not null)
  or (type = 'slider' and answer is not null and slider_min is not null and slider_max is not null and slider_max > slider_min)
  or (type = 'point' and answer is not null and graph is not null)
  or (type = 'counterexample' and answer = 'true' and options is null)
  or (type = 'counterexample' and answer = 'false' and options is not null and jsonb_typeof(options) = 'array'
      and jsonb_array_length(options) between 2 and 6)
);

alter table public.practice_answers
  add column detail text check (detail in ('claim', 'h', 'c', 'other'));

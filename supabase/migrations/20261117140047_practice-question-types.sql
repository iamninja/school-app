-- Practice: seven new question types - counterexample
-- (docs/practice-counterexample-plan.md), and multi, interval, order, match,
-- sign_table, expression (TODO.md, "new question types").
--
-- multi: options as for choice, one or more correct.
-- order: options are the items in the right order ({text, correct: false}).
-- match: options are the pairs ({text, correct: false, match}).
-- sign_table: options are the roots in increasing order (none for a
--   function with no roots); answer is the signs, "+ - +", optionally after
--   the row's label and a bar: "f'(x) | + - +".
-- interval: answer is the interval, "[-1, 3)", "(-inf, {{a}}]".
-- expression: answer is an expression in x, compared by value.
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
  check (type in ('choice', 'true_false', 'number', 'slider', 'point', 'counterexample',
                  'multi', 'interval', 'order', 'match', 'sign_table', 'expression'));

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
  or (type in ('multi', 'order') and options is not null and jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 2 and 8)
  or (type = 'match' and options is not null and jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 2 and 6)
  or (type = 'sign_table' and answer is not null and options is not null and jsonb_typeof(options) = 'array' and jsonb_array_length(options) <= 6)
  or (type in ('interval', 'expression') and answer is not null)
);

alter table public.practice_answers
  add column detail text check (detail in ('claim', 'h', 'c', 'other'));

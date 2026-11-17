-- Practice: counterexample v3a - the student types the counterexample
-- (docs/practice-counterexample-plan.md, "v3").
--
-- practice_questions.counterexample_mode: how a false claim's step 2 is
-- answered - 'auto' (options until the student has got the question right
-- once, then typed), 'options' (always) or 'typed' (always, for logged-in
-- students; guests always get options).
--
-- practice_answers.mode: how a counterexample answer was given - 'options',
-- 'typed', or 'switched' (started typing, then asked for the options).
-- practice_answers.typed: what the student typed, for the teacher.
-- Both null for every other answer. Additive with defaults, so the app that
-- is live before this runs keeps working.

alter table public.practice_questions
  add column counterexample_mode text not null default 'auto'
    check (counterexample_mode in ('auto', 'options', 'typed'));

alter table public.practice_answers
  add column mode text check (mode in ('options', 'typed', 'switched')),
  add column typed text check (char_length(typed) <= 200);

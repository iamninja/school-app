-- Practice: geometry figures (TODO.md, "geometry figures").
--
-- practice_questions.figure: the question's figure as TikZ (a subset the
-- app draws as SVG - lib/practice-tikz.ts), with {{a}} placeholders for a
-- template's numbers. Null for a question without one. Additive, so the
-- live app keeps working.

alter table public.practice_questions
  add column figure text check (figure is null or char_length(figure) <= 20000);

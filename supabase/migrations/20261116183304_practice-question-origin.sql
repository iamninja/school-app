-- Practice: where a question comes from, shown to students as a small
-- label - "Πανελλαδικές · 2019 · Θέμα Β", "Σχολικό βιβλίο · σελ. 45",
-- or a source of the teacher's own naming. Optional, one per question.
--
-- origin: panhellenic | textbook | custom (null: no label).
-- origin_detail: optional free text after the label; for custom it is the
--   source's name, so required.
--
-- (Not the existing `source` column, which records how the question got
-- into the bank: manual / quiz / import.)

alter table public.practice_questions
  add column origin text check (origin in ('panhellenic', 'textbook', 'custom')),
  add column origin_detail text check (origin_detail is null or length(trim(origin_detail)) between 1 and 120),
  -- A CASE, not ORs: with a null origin an OR chain comes out NULL, and
  -- CHECK lets NULL through.
  add constraint practice_questions_origin_shape check (
    case
      when origin is null then origin_detail is null
      when origin = 'custom' then origin_detail is not null
      else true
    end
  );

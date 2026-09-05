-- Opus security audit finding M1, 2026-09-05/06: RLS is row-level, not
-- column-level - a student assigned to a quiz can read every column of
-- their own accessible quiz_question_options/quiz_questions rows,
-- including the answer key (is_correct/model_answer), directly over
-- PostgREST. The app's own fetch actions already select around these two
-- columns before submission (getQuizForTakingAction's own comment says so
-- explicitly), but that's an app-layer convention, not a boundary a raw
-- REST call is bound by - and it can't be, since the very same rows must
-- reveal is_correct to that same student AFTER they submit (the review
-- feature), so a static per-column grant can't be conditioned on
-- submission state anyway. The actual boundary has to be: `authenticated`
-- can never read these two columns directly, full stop; every legitimate
-- app-side read of them (post-ownership-check, in both the teacher and
-- student action files) moves to a service-role client instead.
--
-- IMPORTANT Postgres subtlety, found while testing this migration against
-- a real session rather than trusting it by inspection: a bare
-- `REVOKE SELECT (col) ... FROM role` is a no-op when that role also
-- holds a table-wide SELECT grant (the original baseline schema's
-- `GRANT ALL ON TABLE ... TO authenticated`) - table-level SELECT permits
-- reading every column regardless of any column-level revoke; Postgres
-- only consults column-level grants when the table-level privilege is
-- ABSENT. So the table-wide SELECT has to be revoked outright, then
-- re-granted on an explicit column list that excludes the two answer-key
-- columns. INSERT/UPDATE/DELETE (also part of the original GRANT ALL) are
-- untouched by revoking SELECT specifically - the teacher's own writes
-- (insertQuestions et al.) are unaffected.
--
-- `anon`'s existing GRANT ALL on both tables (remote_schema.sql) is left
-- alone - RLS already has no anon-readable policy on either table, so it
-- is not a live path regardless of column grants.
revoke select on public.quiz_question_options from authenticated;
grant select (id, question_id, option_text, order_index, created_at)
  on public.quiz_question_options to authenticated;

revoke select on public.quiz_questions from authenticated;
grant select (id, quiz_id, question_text, question_type, order_index, points, created_at, image_path)
  on public.quiz_questions to authenticated;

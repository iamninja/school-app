-- Closes two RLS gaps found while removing the service-role bypass on
-- getParentDashboardDataAction (app/auth/parent/actions.ts). That action
-- read everything via the service-role client with comments claiming it
-- "avoids RLS recursion" - that recursion was already fixed properly by
-- the SECURITY DEFINER helper functions in parent-rls.sql/families.sql,
-- so the bypass was redundant. But two things the action reads never had
-- real parent-facing RLS coverage in the first place, which a straight
-- client swap would have silently broken:

-- 1. family_parents only let a parent see their OWN contact row
--    ("Parents view own data" USING (user_id = auth.uid())), not other
--    parents in the same family - breaks the "other parent" contact card.
--    Broadened using the existing is_parent_of_family() helper (already
--    added in families.sql). Strictly a superset of the old policy - a
--    parent's own row always satisfies is_parent_of_family(their own
--    family_id) - so this replaces it rather than adding alongside it.
drop policy if exists "Parents view own data" on public.family_parents;
create policy "Parents view family contacts" on public.family_parents
  for select
  using (public.is_parent_of_family(family_id));

-- 2. quiz_questions had a parent policy on quiz_attempts and
--    quiz_question_options, but never on the base quiz_questions table
--    itself - breaks maxScore computation for every quiz shown on the
--    parent dashboard. Mirrors "Students view assigned quiz questions",
--    same pattern, using the parent-side is_quiz_assigned_to_parent()
--    helper (already added in families.sql).
drop policy if exists "Parents view child quiz questions" on public.quiz_questions;
create policy "Parents view child quiz questions" on public.quiz_questions
  for select
  using (public.is_quiz_assigned_to_parent(quiz_id));

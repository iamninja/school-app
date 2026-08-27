-- The student's own contact number, separate from family_parents.phone.
-- Nullable/optional - most families are reachable through a parent, this
-- just covers the case where a teacher also wants the student's own number.
alter table public.students
  add column phone text;

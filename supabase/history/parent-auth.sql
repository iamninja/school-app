-- Add user_id column to student_parents table to link to auth.users
alter table public.student_parents
  add column if not exists user_id uuid references auth.users(id) on delete set null;

-- Add unique constraint to ensure one parent per user_id
create unique index if not exists student_parents_user_id_unique
  on public.student_parents(user_id)
  where user_id is not null;

-- Add unique index on email when not null (allows multiple parents to register)
create unique index if not exists student_parents_email_unique
  on public.student_parents(email)
  where email is not null;

-- NOTE: This originally skipped RLS policies for parent access due to
-- infinite recursion from circular policy references (a naive students<->
-- student_parents policy pair triggers each other's RLS indefinitely).
-- Superseded by supabase/parent-rls.sql, which restores RLS using
-- SECURITY DEFINER helper functions to break the recursion. Run that file
-- after this one. The application layer (service role client + user_id
-- verification) remains in place as defense-in-depth alongside RLS, not
-- as a replacement for it.

-- Clean up any existing parent policies that may cause recursion
drop policy if exists "Parents view own data" on public.student_parents;
drop policy if exists "Parents view own child data" on public.students;
drop policy if exists "Parents view child class assignments" on public.student_class_assignments;
drop policy if exists "Parents view child classes" on public.classes;
drop policy if exists "Parents view child class schedules" on public.class_schedule_slots;
drop policy if exists "Parents view child attendance" on public.attendance_records;

-- Restores real database-level RLS for parent data.
--
-- parent-auth.sql intentionally skipped RLS on student_parents because a
-- naive policy design causes infinite recursion: a policy on `students`
-- that queries `student_parents` triggers student_parents' own RLS
-- policies, one of which queries `students` again, and so on.
--
-- The fix is SECURITY DEFINER helper functions. They run as their owner
-- (which owns these tables), so queries *inside* them bypass RLS
-- entirely - the recursion is impossible by construction, not by careful
-- policy ordering. Policies call the function; the function's own body
-- never re-triggers RLS.

create or replace function public.is_parent_of_student(student_id_param uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.student_parents
    where student_id = student_id_param
      and user_id = auth.uid()
  );
$$;

create or replace function public.is_parent_of_class(class_id_param uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.student_class_assignments sca
    join public.student_parents sp on sp.student_id = sca.student_id
    where sca.class_id = class_id_param
      and sp.user_id = auth.uid()
  );
$$;

revoke all on function public.is_parent_of_student(uuid) from public;
revoke all on function public.is_parent_of_class(uuid) from public;
grant execute on function public.is_parent_of_student(uuid) to authenticated;
grant execute on function public.is_parent_of_class(uuid) to authenticated;

-- Clean up any earlier attempt at these policies before recreating them,
-- so this file can be re-run safely.
drop policy if exists "Parents view own data" on public.student_parents;
drop policy if exists "Parents view child data" on public.students;
drop policy if exists "Parents view child class assignments" on public.student_class_assignments;
drop policy if exists "Parents view child classes" on public.classes;
drop policy if exists "Parents view child class schedules" on public.class_schedule_slots;
drop policy if exists "Parents view child attendance" on public.attendance_records;

-- Simple self-check, no subquery into another RLS-protected table - safe
-- on its own.
create policy "Parents view own data"
  on public.student_parents
  for select
  using (user_id = auth.uid());

create policy "Parents view child data"
  on public.students
  for select
  using (public.is_parent_of_student(id));

create policy "Parents view child class assignments"
  on public.student_class_assignments
  for select
  using (public.is_parent_of_student(student_id));

create policy "Parents view child classes"
  on public.classes
  for select
  using (public.is_parent_of_class(id));

create policy "Parents view child class schedules"
  on public.class_schedule_slots
  for select
  using (public.is_parent_of_class(class_id));

create policy "Parents view child attendance"
  on public.attendance_records
  for select
  using (public.is_parent_of_student(student_id));

-- All policies here are SELECT-only, matching the students' read-only
-- access model: parents can view but never modify their child's data.

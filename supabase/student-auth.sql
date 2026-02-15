-- Add user_id column to students table to link to auth.users
alter table public.students
  add column if not exists user_id uuid references auth.users(id) on delete set null;

-- Add unique constraint to ensure one student per user_id (and also ensure email is unique when not null)
create unique index if not exists students_user_id_unique
  on public.students(user_id)
  where user_id is not null;

create unique index if not exists students_email_unique
  on public.students(email)
  where email is not null;

-- Add RLS policy for students to view their own data (read-only)
create policy "Students view own data"
  on public.students
  for select
  using (user_id = auth.uid());

-- Add RLS policy for students to view their own parent info
create policy "Students view own parent info"
  on public.student_parents
  for select
  using (
    exists (
      select 1
      from public.students s
      where s.id = student_id
        and s.user_id = auth.uid()
    )
  );

-- Add RLS policy for students to view their own class assignments
create policy "Students view own class assignments"
  on public.student_class_assignments
  for select
  using (
    exists (
      select 1
      from public.students s
      where s.id = student_id
        and s.user_id = auth.uid()
    )
  );

-- Add RLS policy for students to view classes they're assigned to
create policy "Students view assigned classes"
  on public.classes
  for select
  using (
    exists (
      select 1
      from public.student_class_assignments sca
      join public.students s on s.id = sca.student_id
      where sca.class_id = classes.id
        and s.user_id = auth.uid()
    )
  );

-- Add RLS policy for students to view schedules for their classes
create policy "Students view assigned class schedules"
  on public.class_schedule_slots
  for select
  using (
    exists (
      select 1
      from public.student_class_assignments sca
      join public.students s on s.id = sca.student_id
      where sca.class_id = class_schedule_slots.class_id
        and s.user_id = auth.uid()
    )
  );

-- Add RLS policy for students to view their own attendance
create policy "Students view own attendance"
  on public.attendance_records
  for select
  using (
    exists (
      select 1
      from public.students s
      where s.id = student_id
        and s.user_id = auth.uid()
    )
  );

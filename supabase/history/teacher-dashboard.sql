create extension if not exists "pgcrypto";

create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  hours_per_week integer not null check (hours_per_week > 0),
  created_at timestamptz not null default now()
);

create table if not exists public.class_schedule_slots (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  day text not null,
  time text not null,
  created_at timestamptz not null default now(),
  unique (teacher_id, day, time)
);

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  grade_level text,
  email text,
  tuition_amount numeric(10,2),
  tuition_status text not null default 'current',
  created_at timestamptz not null default now()
);

create table if not exists public.student_parents (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  name text,
  email text,
  phone text,
  is_primary boolean not null default false
);

create table if not exists public.student_class_assignments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  unique (student_id, class_id)
);

create table if not exists public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  attendance_date date not null,
  status text not null check (status in ('present', 'late', 'absent')),
  created_at timestamptz not null default now(),
  unique (teacher_id, class_id, student_id, attendance_date)
);

alter table public.classes enable row level security;
alter table public.class_schedule_slots enable row level security;
alter table public.students enable row level security;
alter table public.student_parents enable row level security;
alter table public.student_class_assignments enable row level security;
alter table public.attendance_records enable row level security;

create policy "Teachers manage classes"
  on public.classes
  for all
  using (teacher_id = auth.uid())
  with check (teacher_id = auth.uid());

create policy "Teachers manage schedules"
  on public.class_schedule_slots
  for all
  using (teacher_id = auth.uid())
  with check (teacher_id = auth.uid());

create policy "Teachers manage students"
  on public.students
  for all
  using (teacher_id = auth.uid())
  with check (teacher_id = auth.uid());

create policy "Teachers manage parents"
  on public.student_parents
  for all
  using (
    exists (
      select 1
      from public.students s
      where s.id = student_id
        and s.teacher_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.students s
      where s.id = student_id
        and s.teacher_id = auth.uid()
    )
  );

create policy "Teachers manage student classes"
  on public.student_class_assignments
  for all
  using (
    exists (
      select 1
      from public.students s
      where s.id = student_id
        and s.teacher_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.students s
      where s.id = student_id
        and s.teacher_id = auth.uid()
    )
  );

create policy "Teachers manage attendance"
  on public.attendance_records
  for all
  using (teacher_id = auth.uid())
  with check (teacher_id = auth.uid());

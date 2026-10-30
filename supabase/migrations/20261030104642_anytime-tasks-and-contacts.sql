-- Three additions to the teacher's to-do list (20261024120303_teacher-tasks):
--
-- 1. "Anytime" tasks - personal tasks with no day (task_date null), listed
--    apart from the days. Only an anytime task may carry a due_date: once
--    that passes it counts as overdue, and the calendar marks the day. A
--    dated task's own day already is its due day, and a lesson task always
--    belongs to a lesson's day, so both keep task_date not null.
-- 2. is_email - an email task: a mail button addressed to the people it
--    tags. A task can be both a call and an email; it still sorts as a call.
-- 3. teacher_contacts - people outside the school (a supplier, the
--    accountant) the teacher can tag with "+" in a task. Teacher-only, same
--    single policy as teacher_tasks; nothing here reaches a portal. Tags
--    are tokens in the title (lib/task-tags.ts), so no foreign key: a
--    deleted contact's tag keeps reading by its label.

alter table public.teacher_tasks
  alter column task_date drop not null,
  add column due_date date,
  add column is_email boolean not null default false;

alter table public.teacher_tasks
  add constraint teacher_tasks_anytime_check check (
    -- no day: a personal task with no time; a due date only then.
    (task_date is not null and due_date is null)
    or (task_date is null and kind = 'personal' and task_time is null)
  );

-- The anytime list and its due dates (open ones - overdue and calendar marks).
create index teacher_tasks_anytime_idx
  on public.teacher_tasks (teacher_id, due_date)
  where task_date is null;

create table public.teacher_contacts (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  -- "Supplier", "Accountant" … - optional.
  label text check (length(label) <= 60),
  -- E.164 as the app normalises it (lib/teacher-app/phone.ts), optional.
  phone text check (phone ~ '^\+[1-9][0-9]{6,14}$'),
  email text check (length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+$'),
  created_at timestamptz not null default now()
);

alter table public.teacher_contacts enable row level security;

create policy "Teachers manage their contacts" on public.teacher_contacts
  using ((teacher_id = auth.uid()) and public.is_teacher())
  with check ((teacher_id = auth.uid()) and public.is_teacher());

create index teacher_contacts_teacher_idx on public.teacher_contacts (teacher_id, name);

-- The teacher's own to-do list: tasks to do before or after a lesson, and
-- personal tasks with no lesson at all ("pay the accountant"). Each belongs
-- to one date. Teacher-only by construction: the one policy below checks
-- teacher_id = auth.uid() and is_teacher(), and there is deliberately no
-- parent or student policy - nothing here ever reaches a portal.
--
-- A lesson task points at its lesson the same way the calendar identifies
-- one (lib/calendar-projection.ts):
--   - a recurring class lesson: class_id + task_date + slot_time (the
--     template slot's start - a class can meet twice a day);
--   - an extra session, one-off or trial lesson: calendar_event_id.
-- lesson_label snapshots the lesson's name and time ("Β Λυκείου 17:00") so a
-- task still reads sensibly if its class or event is deleted later - both
-- links are ON DELETE SET NULL, the snapshot convention of
-- 20260819225129. For the same reason the shape check below is written
-- against kind/lesson_label, never the FK columns (see the note on
-- calendar_events_shape_check, 20260821175434).
--
-- A title may tag students, parents and classes as inline tokens,
-- "@[Ελένη](parent:<uuid>)" (lib/task-tags.ts) - the server checks every
-- tagged id is the teacher's own before saving, so the length bound is on
-- the stored text (tokens included); the visible text is held to 200
-- characters by the app. is_call marks a task as a phone call: it gets a
-- call button for the people it tags and sorts first.

create table public.teacher_tasks (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users (id) on delete cascade,

  kind text not null check (kind in ('lesson', 'personal')),
  title text not null check (length(btrim(title)) between 1 and 2000),
  is_call boolean not null default false,
  task_date date not null,
  -- personal tasks only, optional: 'HH:MM', same format as lesson times.
  task_time text check (task_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),

  -- lesson tasks only.
  phase text check (phase in ('before', 'after')),
  class_id uuid references public.classes (id) on delete set null,
  slot_time text check (slot_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  calendar_event_id uuid references public.calendar_events (id) on delete set null,
  lesson_label text,

  done_at timestamptz,
  created_at timestamptz not null default now(),

  constraint teacher_tasks_shape_check check (
    case kind
      when 'lesson' then
        phase is not null
        and lesson_label is not null
        and task_time is null
        -- never both links at once (either may be nulled by its FK later)
        and (class_id is null or calendar_event_id is null)
      when 'personal' then
        phase is null
        and class_id is null and slot_time is null
        and calendar_event_id is null and lesson_label is null
    end
  )
);

alter table public.teacher_tasks enable row level security;

create policy "Teachers manage their tasks" on public.teacher_tasks
  using ((teacher_id = auth.uid()) and public.is_teacher())
  with check ((teacher_id = auth.uid()) and public.is_teacher());

-- A day's tasks (the calendar's month view and the companion's Today).
create index teacher_tasks_teacher_date_idx
  on public.teacher_tasks (teacher_id, task_date);

-- "Overdue": open tasks from earlier days.
create index teacher_tasks_open_idx
  on public.teacher_tasks (teacher_id, task_date)
  where done_at is null;

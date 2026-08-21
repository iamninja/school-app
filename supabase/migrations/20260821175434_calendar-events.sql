-- Schedule exceptions and one-off sessions. The recurring weekly template
-- (class_schedule_slots) has no date semantics at all, so there was no way
-- to record a cancelled class, a makeup/extra session, or a one-off lesson.
-- This table is the override layer; occurrences are projected on the fly by
-- lib/calendar-projection.ts, never materialized into a sessions table.
--
-- One table discriminated by event_type, not one table per type: every type
-- shares (teacher, date, time, notes) and every read is "what's on date X",
-- which a single table answers with one index.

create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users (id) on delete cascade,

  event_type text not null check (event_type in (
    'cancellation',   -- a template occurrence does not happen
    'extra_session',  -- an existing class meets outside its template
    'ad_hoc_lesson',  -- a one-off for an enrolled student, no class
    'trial_lesson',   -- a prospective person with no student record
    'block'           -- teacher-only personal/admin time
  )),

  event_date date not null,
  -- Text 'HH:MM', matching class_schedule_slots."time" exactly - the
  -- projection compares these two values directly, so they must be the same
  -- type and format. NULL means whole-day (a whole-day cancellation, or an
  -- all-day block).
  start_time text check (start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  end_time   text check (end_time   ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  check (end_time is null or start_time is null or end_time > start_time),

  -- Snapshot + SET NULL, the convention established by
  -- attendance_records.class_name (20260819225129) and
  -- quiz_attempts.quiz_title (20260819225122): a dated historical record
  -- must survive its parent being deleted. Populated by the server action
  -- from a row it already had to SELECT for the ownership check - never by
  -- a trigger.
  class_id   uuid references public.classes  (id) on delete set null,
  class_name text,
  student_id uuid references public.students (id) on delete set null,
  student_name text,

  -- trial_lesson only: a prospective person has no students row to join to.
  contact_name  text,
  contact_phone text,
  -- block only: what the block is for ("Λογιστής", "Doctor").
  title text,
  notes text,

  created_at timestamptz not null default now(),

  -- Shape rules per type. Deliberately phrased against the SNAPSHOT columns
  -- for the "required" side and the FK columns for the "forbidden" side:
  -- class_id/student_id are ON DELETE SET NULL, and an FK SET NULL action is
  -- an UPDATE, which re-validates this CHECK. Requiring `class_id is not
  -- null` here would make `delete from classes` fail outright - exactly the
  -- unguarded delete the snapshot convention exists to allow. class_name is
  -- never touched by an FK action, so it carries the invariant safely, and
  -- the server action enforces class_id NOT NULL at write time (where it
  -- already does a classes lookup for the ownership check anyway).
  constraint calendar_events_shape_check check (
    case event_type
      when 'cancellation' then
        class_name is not null
        and student_id is null and student_name is null
        and contact_name is null and contact_phone is null
      when 'extra_session' then
        class_name is not null
        and student_id is null and student_name is null
        and contact_name is null and contact_phone is null
        and start_time is not null
      when 'ad_hoc_lesson' then
        student_name is not null
        and class_id is null and class_name is null
        and contact_name is null and contact_phone is null
        and start_time is not null
      when 'trial_lesson' then
        contact_name is not null
        and class_id is null and class_name is null
        and student_id is null and student_name is null
        and start_time is not null
      when 'block' then
        title is not null
        and class_id is null and class_name is null
        and student_id is null and student_name is null
        and contact_name is null and contact_phone is null
    end
  )
);

alter table public.calendar_events enable row level security;

-- Hardened shape (20260815225844): ownership alone would let a student or
-- parent account that bypassed requireTeacher() write rows under its own
-- auth.uid().
create policy "Teachers manage calendar events" on public.calendar_events
  using ((teacher_id = auth.uid()) and public.is_teacher())
  with check ((teacher_id = auth.uid()) and public.is_teacher());

-- Portal visibility. No event_type branching is needed and none should be
-- added: trial_lesson and block rows have class_id AND student_id NULL, and
-- comparing a column to a NULL parameter is false in Postgres, so every
-- helper below returns false for them by construction. That NULL-safety is
-- the whole reason the discriminated-table design needs no extra policy
-- shape - it is asserted directly in tests/rls/calendar-events.test.ts.
create policy "Parents view child calendar events" on public.calendar_events
  for select
  using (
    public.is_parent_of_class(class_id)
    or public.is_parent_of_student(student_id)
  );

-- No is_student_of_student() helper exists, so the student's own
-- ad_hoc_lesson leg is a plain inline EXISTS - matching the existing
-- "Students view own attendance" policy rather than adding a helper for one
-- call site.
create policy "Students view own calendar events" on public.calendar_events
  for select
  using (
    public.is_student_of_class(class_id)
    or exists (
      select 1 from public.students s
      where s.id = calendar_events.student_id and s.user_id = auth.uid()
    )
  );

-- Month view: "everything for this teacher between two dates".
create index calendar_events_teacher_date_idx
  on public.calendar_events (teacher_id, event_date);

-- Attendance gating and the portal per-child partition.
create index calendar_events_class_date_idx
  on public.calendar_events (class_id, event_date)
  where class_id is not null;

create index calendar_events_student_date_idx
  on public.calendar_events (student_id, event_date)
  where student_id is not null;

-- A class occurrence can only be cancelled once. Two "cancel Monday" clicks
-- from two tabs would otherwise leave two rows, and deleting one to restore
-- the class would silently leave it still cancelled. coalesce('') collapses
-- the whole-day (NULL start_time) case into the same key space. Deliberately
-- NOT extended to extra_session: two extra sessions on one date at different
-- times is legitimate.
create unique index calendar_events_one_cancellation_idx
  on public.calendar_events (teacher_id, class_id, event_date, coalesce(start_time, ''))
  where event_type = 'cancellation' and class_id is not null;

-- In-person tests: the teacher announces a test ahead of time, students take
-- it physically at the center, and the teacher enters a mark afterward. Two
-- kinds share one lifecycle (registered -> taken -> marked) but differ in
-- how "when" is expressed: a short_test has a deadline (or none - "open"),
-- a mock_exam has a fixed scheduled date/time.
--
-- Deliberately NOT built on the quizzes tables: quizzes are taken in-app,
-- auto/AI-graded per question, and assigned at the class level only. Tests
-- are graded with a single manually-entered mark and need a per-student
-- assignment row from the moment they're registered (to carry the
-- taken/marked state and a per-student schedule override).
--
-- tests = the template (what/when/how much it's worth). test_assignments =
-- one row per (test, student) - the actual roster, schedule, and grade.

create table public.tests (
  id            uuid primary key default gen_random_uuid(),
  teacher_id    uuid not null references auth.users (id) on delete cascade,

  kind          text not null check (kind in ('short_test', 'mock_exam')),
  title         text not null,
  description   text,
  max_score     numeric(6,2) not null check (max_score > 0),

  -- short_test: at most 1h. mock_exam: 1-3h. Branching on `kind` lets 60
  -- minutes be a valid boundary value for both without conflict.
  duration_minutes integer not null check (
    (kind = 'short_test' and duration_minutes > 0 and duration_minutes <= 60)
    or
    (kind = 'mock_exam' and duration_minutes >= 60 and duration_minutes <= 180)
  ),

  -- mock_exam template: a specific date, optional time. Text 'HH:MM',
  -- matching class_schedule_slots."time"/calendar_events.start_time.
  scheduled_date date,
  scheduled_time text check (scheduled_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),

  -- short_test template: a specific deadline, or NULL meaning open/no
  -- deadline - it can be taken any time and never becomes late.
  deadline_at   timestamptz,

  -- Snapshot + SET NULL, the convention established by
  -- attendance_records.class_name/calendar_events.class_name: the test is a
  -- historical record that must survive its class being deleted. Populated
  -- by the server action from a row it already fetched for the ownership
  -- check - never by a trigger.
  class_id      uuid references public.classes (id) on delete set null,
  class_name    text,

  created_at    timestamptz not null default now(),

  constraint tests_kind_shape_check check (
    case kind
      when 'mock_exam'  then scheduled_date is not null and deadline_at is null
      when 'short_test' then scheduled_date is null and scheduled_time is null
    end
  ),
  -- Only "class_id set -> class_name must be set" is enforced, not the
  -- reverse - a symmetric check would break the moment `delete from
  -- classes` fires ON DELETE SET NULL, which nulls class_id but
  -- deliberately leaves class_name as the surviving historical snapshot
  -- (same reasoning as calendar_events_shape_check).
  constraint tests_class_snapshot_check check (
    class_id is null or class_name is not null
  )
);

alter table public.tests enable row level security;

create policy "Teachers manage tests" on public.tests
  using ((teacher_id = auth.uid()) and public.is_teacher())
  with check ((teacher_id = auth.uid()) and public.is_teacher());

-- The parent/student SELECT policies on `tests` live further down, after
-- test_assignments is created - they EXISTS-join into it, so they can't be
-- declared until that table exists.

create index tests_teacher_idx on public.tests (teacher_id, created_at desc);
create index tests_class_idx on public.tests (class_id) where class_id is not null;
create index tests_teacher_scheduled_date_idx
  on public.tests (teacher_id, scheduled_date)
  where kind = 'mock_exam' and scheduled_date is not null;


-- One row per (test, student). Unlike calendar_events/attendance_records,
-- this is NOT a snapshot-and-outlive-its-parent record: it is a tightly
-- owned join artifact of one specific test and one specific student, so
-- both FKs are a plain CASCADE, not SET NULL. Deleting the test ("I
-- registered this by mistake") or the student takes their assignment rows
-- with them - there is no "orphaned mark" use case here.
create table public.test_assignments (
  id          uuid primary key default gen_random_uuid(),
  teacher_id  uuid not null references auth.users (id) on delete cascade,
  test_id     uuid not null references public.tests (id) on delete cascade,
  student_id  uuid not null references public.students (id) on delete cascade,

  -- Denormalized from tests.kind at insert time (never a trigger - the
  -- server action already fetches the parent test row for the ownership
  -- check). Lets the shape check below stay same-table.
  kind        text not null check (kind in ('short_test', 'mock_exam')),

  -- Per-student effective values, defaulted from the test's template at
  -- insert time and independently editable afterward - this is what lets a
  -- class-wide mock_exam move one student's date without touching anyone
  -- else's. Editing the test's own template later does NOT cascade to
  -- existing assignment rows.
  effective_scheduled_date date,
  effective_scheduled_time text check (effective_scheduled_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  effective_deadline_at    timestamptz,

  -- Set once by the teacher (markTestTakenAction/enterTestMarkAction) and
  -- never overwritten again. This is the single source of truth
  -- "lateness" is derived from (see lib/test-status.ts) - deriving from a
  -- permanent taken_at, rather than storing "late" as a status value, is
  -- what lets a late test still show as late after it's graded.
  taken_at    timestamptz,

  status      text not null default 'registered'
                check (status in ('registered', 'taken', 'marked')),
  score       numeric(6,2),
  teacher_comment text,

  created_at  timestamptz not null default now(),

  constraint test_assignments_shape_check check (
    case kind
      when 'mock_exam'  then effective_scheduled_date is not null and effective_deadline_at is null
      when 'short_test' then effective_scheduled_date is null and effective_scheduled_time is null
    end
  ),
  -- State machine, enforced here too (belt-and-braces, matching
  -- calendar_events' shape check): taken_at/score must be present/absent
  -- exactly as their status implies. Clearing a mark reverts status to
  -- 'taken' (taken_at is kept, never nulled) - see clearTestMarkAction.
  -- score <= max_score is a cross-table invariant (tests.max_score) and is
  -- enforced in the server action, not here - Postgres CHECK can't
  -- reference another table.
  --
  -- Explicitly NOT named test_assignments_status_check - Postgres
  -- auto-names the inline `status ... check (status in (...))` column
  -- check exactly that (<table>_<column>_check), and a same-name explicit
  -- constraint on the same table collides with it.
  constraint test_assignments_status_fields_check check (
    (status = 'registered' and taken_at is null and score is null)
    or (status = 'taken' and taken_at is not null and score is null)
    or (status = 'marked' and taken_at is not null and score is not null)
  ),
  constraint test_assignments_unique unique (test_id, student_id)
);

alter table public.test_assignments enable row level security;

create policy "Teachers manage test assignments" on public.test_assignments
  using ((teacher_id = auth.uid()) and public.is_teacher())
  with check ((teacher_id = auth.uid()) and public.is_teacher());

-- Direct student_id column - no join/helper function needed, unlike
-- quiz_assignments (class-level only).
create policy "Parents view child test assignments" on public.test_assignments
  for select using (public.is_parent_of_student(student_id));

create policy "Students view own test assignments" on public.test_assignments
  for select using (
    exists (
      select 1 from public.students s
      where s.id = test_assignments.student_id and s.user_id = auth.uid()
    )
  );

create index test_assignments_test_idx on public.test_assignments (test_id);
create index test_assignments_student_idx on public.test_assignments (student_id);
create index test_assignments_teacher_idx on public.test_assignments (teacher_id);

-- Deferred from the `tests` table's own RLS block above - needs
-- test_assignments to exist first.
create policy "Parents view child tests" on public.tests
  for select using (
    exists (
      select 1 from public.test_assignments ta
      where ta.test_id = tests.id
        and public.is_parent_of_student(ta.student_id)
    )
  );

create policy "Students view own tests" on public.tests
  for select using (
    exists (
      select 1 from public.test_assignments ta
      join public.students s on s.id = ta.student_id
      where ta.test_id = tests.id and s.user_id = auth.uid()
    )
  );

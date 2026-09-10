-- Whole-class homework: a short free-text note (usually just exercise
-- numbers, e.g. "σελ. 42, ασκήσεις 1-10"), optionally with a due date.
-- Read-only for students in v1 - no completion tracking (could be added
-- later as a separate per-student table, the way assessment_assignments
-- was added after quiz_assignments).
--
-- One row per (class, homework item), not per student - homework needs
-- no per-student override or grade, so unlike assessments this is a
-- single table, closer to quiz_assignments than to assessments/
-- assessment_assignments.
--
-- class_id is a plain CASCADE, not snapshot+SET NULL: homework is a
-- tightly-owned artifact of one class (like quiz_assignments), not a
-- historical record that must outlive the class the way attendance_
-- records/assessments are. Tradeoff: deleting a class deletes its
-- homework history too - acceptable for a short-lived class note;
-- revisit if that history ever needs to survive class deletion.
create table public.homework (
  id          uuid primary key default gen_random_uuid(),
  teacher_id  uuid not null references auth.users (id) on delete cascade,
  class_id    uuid not null references public.classes (id) on delete cascade,

  note        text not null check (length(trim(note)) > 0),
  due_date    date,

  created_at  timestamptz not null default now()
);

alter table public.homework enable row level security;

-- is_teacher() baked in from day one (quiz_assignments predates this
-- hardening and was retrofitted in 20260815225844_harden-teacher-rls.sql;
-- assessments already includes it - homework should match assessments).
create policy "Teachers manage homework" on public.homework
  using ((teacher_id = auth.uid()) and public.is_teacher())
  with check ((teacher_id = auth.uid()) and public.is_teacher());

create policy "Parents view child class homework" on public.homework
  for select using (public.is_parent_of_class(class_id));

create policy "Students view own class homework" on public.homework
  for select using (public.is_student_of_class(class_id));

create index homework_class_idx on public.homework (class_id);
create index homework_teacher_idx on public.homework (teacher_id, created_at desc);

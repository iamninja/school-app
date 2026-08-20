-- Same philosophy as quiz_attempts (see snapshot-attempts-on-quiz-delete):
-- deleting a class should never destroy a student's attendance history.
-- class_name is snapshotted at record time and the FK becomes SET NULL
-- instead of CASCADE. student_class_assignments and quiz_assignments are
-- deliberately NOT snapshotted here - they're current-membership/join rows,
-- not a historical event a student cares about once the class is gone, and
-- they already cascade away freely (matching how quiz_assignments already
-- behaves when a quiz is deleted).

alter table public.attendance_records
  add column class_name text;

update public.attendance_records ar
set class_name = c.name
from public.classes c
where c.id = ar.class_id;

alter table public.attendance_records
  alter column class_name set not null;

alter table public.attendance_records
  drop constraint attendance_records_class_id_fkey;

alter table public.attendance_records
  alter column class_id drop not null;

alter table public.attendance_records
  add constraint attendance_records_class_id_fkey
  foreign key (class_id) references public.classes(id) on delete set null;

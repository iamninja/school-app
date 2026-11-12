-- Who comes to a class's weekly hour, when it isn't everyone in the class.
--
-- A class meets for its hours_per_week, but one hour can be for only some
-- of its students - e.g. a 3-hour class where two students stay for the
-- third hour and the third does that hour alone, at another time. Rather
-- than separate classes for each group, the class keeps all three students
-- and each of its weekly hours (class_schedule_slots) can list who it's
-- for:
--
--   student_ids null  -> everyone enrolled in the class (every existing
--                        slot, so nothing changes for them)
--   student_ids [...] -> only these students (a split hour, or one
--                        student's own hour)
--
-- An array rather than a join table: a slot is identified by
-- (teacher_id, day, time) and moving one in the Schedule tab deletes and
-- re-inserts the row, so the list travels in the same upsert as the slot.
-- The app checks the ids are students enrolled in the class; a student who
-- later leaves the class simply no longer matches. Rosters, attendance
-- alerts and the student/parent portals filter by it (lib/class-hours.ts);
-- the portals never receive other students' ids.

alter table public.class_schedule_slots
  add column student_ids uuid[]
    check (student_ids is null or cardinality(student_ids) > 0);

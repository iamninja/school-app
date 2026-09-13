-- A recurring slot's real end time, when it differs from the one derived
-- from grid-row spacing (lib/schedule-grid.ts recurringLessonWindow). NULL
-- means "derive it" - i.e. exactly the pre-existing behaviour, so no
-- backfill is needed and every slot placed before this migration renders
-- and labels identically until the teacher customizes it.
--
-- Deliberately no separate start_time column: a customized lesson is always
-- exactly 45 minutes (LESSON_MINUTES) - only its position shifts, never its
-- duration - so the start is deduced as `end_time - 45min` (see
-- lib/schedule-grid.ts's slotWindow()). If a genuine variable-duration need
-- ever comes up, add a nullable start_time column then; every existing row
-- keeps end_time-only behaviour unchanged.
--
-- "time" is NOT touched and must not be: it is the grid-cell anchor (the
-- drop-target id, the upsert conflict target, and the value a cancellation
-- calendar_events row matches on in lib/calendar-projection.ts).
alter table public.class_schedule_slots
  add column end_time text
    check (end_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');

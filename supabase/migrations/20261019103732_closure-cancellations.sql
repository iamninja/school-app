-- School closures: Christmas/Easter breaks, public holidays, weather days,
-- strikes. A closure is NOT a new event type - it is a batch of ordinary
-- per-class 'cancellation' rows, one per template occurrence in the closed
-- dates, created together (app/protected/teacher/calendar-actions.ts,
-- cancelLessonsForClosureAction). That keeps every existing consumer
-- (lib/calendar-projection.ts, lib/attendance-dates.ts, the portals' RLS,
-- push notices) working unchanged: to all of them a closed day is just a
-- set of cancelled lessons.
--
-- Two columns on top:
--   cancellation_reason - why, shown on the teacher's calendar and in the
--                         portals ("Ακύρωση · Απεργία");
--   closure_id          - groups the rows of one closure so the whole thing
--                         can be undone at once. No FK: there is no closures
--                         table, the id only exists on its rows.
-- Both are cancellation-only; a single "Cancel this class" may carry a
-- reason too, with closure_id null.

alter table public.calendar_events
  add column cancellation_reason text check (cancellation_reason in (
    'christmas', 'easter', 'public_holiday', 'weather', 'strike', 'other'
  )),
  add column closure_id uuid;

alter table public.calendar_events
  add constraint calendar_events_closure_fields_check check (
    event_type = 'cancellation'
    or (cancellation_reason is null and closure_id is null)
  );

-- "Restore the whole closure" deletes by this.
create index calendar_events_closure_idx
  on public.calendar_events (teacher_id, closure_id)
  where closure_id is not null;

-- One notice per class for a closure (instead of one per cancelled lesson),
-- and its undo. Keep in sync with EDITABLE_EVENTS in lib/push/messages.ts
-- (tests/push-messages.test.ts checks it).
alter table public.notification_templates
  drop constraint notification_templates_event_check;

alter table public.notification_templates
  add constraint notification_templates_event_check check (event in (
    'homework', 'homework_reminder', 'quiz', 'quiz_reminder',
    'assessment', 'assessment_moved', 'assessment_reminder',
    'lesson_cancelled', 'lesson_moved', 'lesson_extra', 'lesson_restored',
    'lessons_closed', 'lessons_reopened',
    'mark_entered', 'quiz_graded', 'absence_student', 'absence_parent',
    'receipt', 'monthly_charge', 'balance_reminder',
    'teacher_quiz_review', 'teacher_charge_failed', 'teacher_mydata_failed',
    'teacher_attendance_missing', 'teacher_attendance_summary'
  ));

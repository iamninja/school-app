-- The dates a school closure was declared for (e.g. 24/12-7/1), on every
-- cancellation row it created. Without them the portals could only show a
-- break as "first to last cancelled lesson" (28/12-4/1 for a Mon/Wed class),
-- not the official break. Stored on the rows rather than in a closures
-- table so the portals read them under the calendar_events policies they
-- already have. Rows from closures made before this migration stay null and
-- fall back to the lesson-date range (lib/school-closures.ts).

alter table public.calendar_events
  add column closure_from date,
  add column closure_to date;

alter table public.calendar_events
  add constraint calendar_events_closure_range_check check (
    (closure_from is null and closure_to is null)
    or (
      event_type = 'cancellation'
      and closure_from is not null
      and closure_to is not null
      and closure_from <= closure_to
    )
  );

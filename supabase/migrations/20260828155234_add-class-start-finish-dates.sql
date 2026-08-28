-- Optional start/finish date for a class, so the calendar can stop
-- projecting a class's recurring slots before it starts or after it ends.
-- Distinct from duration_months (20260825164949_school-year-window.sql),
-- which is descriptive billing metadata only and never touched the
-- calendar. Both null (the default) keeps today's "indefinite" projection.
alter table public.classes
  add column if not exists start_date date,
  add column if not exists finish_date date;

alter table public.classes
  add constraint classes_date_window_check
  check (start_date is null or finish_date is null or finish_date >= start_date);

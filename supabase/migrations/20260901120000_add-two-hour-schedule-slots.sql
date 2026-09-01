-- A 2-hour class is stored as a single class_schedule_slots row at its start
-- time with is_two_hour = true; the next weekly grid row for that day is
-- implicitly reserved by this flag rather than getting its own row.
alter table public.class_schedule_slots
  add column is_two_hour boolean not null default false;

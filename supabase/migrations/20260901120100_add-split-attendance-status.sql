-- "split" ("1+1") means one hour present, one hour absent, for a two-hour
-- lesson. It's a 4th attendance_records status value, not a second row.
alter table public.attendance_records drop constraint attendance_records_status_check;
alter table public.attendance_records add constraint attendance_records_status_check
  check (status = any (array['present','late','absent','split']));

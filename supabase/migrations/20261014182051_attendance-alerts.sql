-- Attendance reminders for the teacher, and the frequent scheduler.
--
-- 1. A new teacher alert, "attendance not taken": an in-lesson alert once a
--    lesson has run 20 minutes with nobody marked, plus an evening summary
--    and a next-morning catch-up (lib/push/attendance-alerts.ts). One App-tab
--    switch covers both texts.
-- 2. attendance_alerts records which lessons were alerted/summarised, so
--    every alert fires once however often the jobs run.
-- 3. pg_cron calls /api/cron/notifications every 10 minutes during teaching
--    hours. The URL and the CRON_SECRET live in Supabase Vault (secrets
--    'app_base_url' and 'cron_secret', added in the dashboard - never in the
--    repo). Without them the job does nothing, so projects that aren't set
--    up (dev) stay idle.

-- 1. Switch and editable texts -------------------------------------------------

alter table public.notification_settings
  add column teacher_attendance_missing boolean not null default true;

alter table public.notification_templates
  drop constraint notification_templates_event_check;

alter table public.notification_templates
  add constraint notification_templates_event_check check (event in (
    'homework', 'homework_reminder', 'quiz', 'quiz_reminder',
    'assessment', 'assessment_moved', 'assessment_reminder',
    'lesson_cancelled', 'lesson_moved', 'lesson_extra', 'lesson_restored',
    'mark_entered', 'quiz_graded', 'absence_student', 'absence_parent',
    'receipt', 'monthly_charge', 'balance_reminder',
    'teacher_quiz_review', 'teacher_charge_failed', 'teacher_mydata_failed',
    'teacher_attendance_missing', 'teacher_attendance_summary'
  ));

-- 2. One row per lesson (class + day) that was alerted or summarised -----------

create table public.attendance_alerts (
  class_id      uuid not null references public.classes (id) on delete cascade,
  lesson_date   date not null,
  alerted_at    timestamptz,
  summarized_at timestamptz,
  primary key (class_id, lesson_date)
);

alter table public.attendance_alerts enable row level security;

-- Written only by the server (service role); the teacher may read it.
create policy "Teachers read attendance alerts"
  on public.attendance_alerts
  for select
  to authenticated
  using (public.is_teacher());

-- 3. Frequent scheduler ----------------------------------------------------------

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

create schema if not exists private;
revoke all on schema private from public;

create or replace function private.call_frequent_notifications()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  base_url text;
  secret   text;
begin
  select decrypted_secret into base_url
    from vault.decrypted_secrets where name = 'app_base_url';
  select decrypted_secret into secret
    from vault.decrypted_secrets where name = 'cron_secret';

  if base_url is null or secret is null or base_url = '' or secret = '' then
    return;
  end if;

  perform net.http_get(
    url := rtrim(base_url, '/') || '/api/cron/notifications',
    headers := jsonb_build_object('Authorization', 'Bearer ' || secret),
    timeout_milliseconds := 30000
  );
end;
$$;

revoke all on function private.call_frequent_notifications() from public;

-- Times are UTC and wide enough for both summer (UTC+3) and winter (UTC+2):
--   Mon-Fri 10:00-21:59 UTC = 13:00-00:59 Athens in summer, 12:00-23:59 in winter
--   Sat     04:00-16:59 UTC = 07:00-19:59 Athens in summer, 06:00-18:59 in winter
-- Re-running this migration's statements replaces the jobs instead of
-- duplicating them.
select cron.unschedule(jobid)
  from cron.job
  where jobname in ('modus-frequent-weekdays', 'modus-frequent-saturday');

select cron.schedule(
  'modus-frequent-weekdays',
  '*/10 10-21 * * 1-5',
  'select private.call_frequent_notifications()'
);

select cron.schedule(
  'modus-frequent-saturday',
  '*/10 4-16 * * 6',
  'select private.call_frequent_notifications()'
);

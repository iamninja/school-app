-- Push notifications (Web Push) for the installed app, plus the teacher's
-- "App" tab that manages them.
--
-- Who writes what:
--   * push_subscriptions - each signed-in user, for their own devices only
--     (the server action moves an endpoint between users with the service
--     role when a different person signs in on the same browser).
--   * notification_inbox - written by the server (service role); each user
--     reads their own rows and may only set read_at.
--   * everything else - the teacher (is_teacher()) through the App tab, and
--     the server's sending code through the service role.
--
-- Like business_profile, nothing here is scoped per teacher: there is one
-- school, so the settings are a singleton row gated on is_teacher().

-- One row per browser/device that agreed to receive notifications.
create table public.push_subscriptions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  -- The push service URL. Unique: one browser = one endpoint = one owner.
  endpoint        text not null unique
                    check (endpoint ~ '^https://' and length(endpoint) <= 1000),
  p256dh          text not null check (length(p256dh) between 1 and 200),
  auth            text not null check (length(auth) between 1 and 100),
  user_agent      text check (length(user_agent) <= 500),
  created_at      timestamptz not null default now(),
  last_success_at timestamptz
);

create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

create policy "Users read own push subscriptions" on public.push_subscriptions
  for select using (user_id = auth.uid());

create policy "Users add own push subscriptions" on public.push_subscriptions
  for insert with check (user_id = auth.uid());

create policy "Users remove own push subscriptions" on public.push_subscriptions
  for delete using (user_id = auth.uid());

-- The App tab's switches and options. One switch per notification type.
create table public.notification_settings (
  id integer primary key default 1,

  -- School notices (to students; parents only through parent_fallback).
  homework            boolean not null default true,
  homework_reminders  boolean not null default true,
  quizzes             boolean not null default true,
  quiz_reminders      boolean not null default true,
  assessments         boolean not null default true,
  test_reminders      boolean not null default true,
  lesson_changes      boolean not null default true,
  marks               boolean not null default true,
  absences            boolean not null default true,

  -- Money notices (to parents). Never carry amounts.
  receipts            boolean not null default true,
  monthly_charges     boolean not null default false,
  balance_reminder    boolean not null default false,

  -- Alerts to the teacher's own devices.
  teacher_quiz_review   boolean not null default true,
  teacher_charge_failed boolean not null default true,
  teacher_mydata_failed boolean not null default true,

  -- A student with no login -> their school notices go to their parents.
  parent_fallback     boolean not null default true,

  -- Master switch: stops everything except teacher alerts.
  paused              boolean not null default false,

  quiet_hours_enabled boolean not null default false,
  quiet_start         text not null default '22:00'
                        check (quiet_start ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  quiet_end           text not null default '08:00'
                        check (quiet_end ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),

  -- Evening reminders (homework, quiz deadline, test), Europe/Athens.
  homework_reminder_time text not null default '20:00'
                        check (homework_reminder_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  absence_timing      text not null default 'immediate'
                        check (absence_timing in ('immediate', 'after_lesson')),
  balance_reminder_day integer not null default 10
                        check (balance_reminder_day between 1 and 28),

  updated_at timestamptz not null default now(),
  constraint notification_settings_singleton check (id = 1)
);

alter table public.notification_settings enable row level security;

create policy "Teachers manage notification settings" on public.notification_settings
  using (public.is_teacher())
  with check (public.is_teacher());

insert into public.notification_settings (id) values (1)
on conflict (id) do nothing;

-- The teacher's edited texts. Only overrides live here: no row means the
-- built-in default from lib/push/messages.ts. Keep the event list in sync
-- with EDITABLE_EVENTS there (tests/push-messages.test.ts checks it).
create table public.notification_templates (
  event text primary key check (event in (
    'homework', 'homework_reminder', 'quiz', 'quiz_reminder',
    'assessment', 'assessment_moved', 'assessment_reminder',
    'lesson_cancelled', 'lesson_moved', 'lesson_extra', 'lesson_restored',
    'mark_entered', 'quiz_graded', 'absence_student', 'absence_parent',
    'receipt', 'monthly_charge', 'balance_reminder',
    'teacher_quiz_review', 'teacher_charge_failed', 'teacher_mydata_failed'
  )),
  -- What a phone shows without cutting the text off.
  title text not null check (length(trim(title)) between 1 and 60),
  body  text not null check (length(trim(body)) between 1 and 180),
  updated_at timestamptz not null default now()
);

alter table public.notification_templates enable row level security;

create policy "Teachers manage notification templates" on public.notification_templates
  using (public.is_teacher())
  with check (public.is_teacher());

-- One row per notice sent (to however many people/devices).
create table public.notification_log (
  id              uuid primary key default gen_random_uuid(),
  event           text not null,
  audience        text not null,
  title           text not null,
  body            text not null,
  url             text,
  recipient_users integer not null default 0,
  devices         integer not null default 0,
  delivered       integer not null default 0,
  failed          integer not null default 0,
  -- 'held' = put in notification_queue for after quiet hours.
  outcome         text not null default 'sent'
                    check (outcome in ('sent', 'held', 'no_devices', 'not_configured')),
  triggered_by    uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now()
);

create index notification_log_created_idx on public.notification_log (created_at desc);
create index notification_log_event_idx on public.notification_log (event, created_at desc);

alter table public.notification_log enable row level security;

create policy "Teachers read notification log" on public.notification_log
  for select using (public.is_teacher());

-- What each person sees under the bell in their portal. Written even when
-- they have no device with notifications on.
create table public.notification_inbox (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  event      text not null,
  title      text not null,
  body       text not null,
  url        text,
  created_at timestamptz not null default now(),
  read_at    timestamptz
);

create index notification_inbox_user_idx on public.notification_inbox (user_id, created_at desc);

alter table public.notification_inbox enable row level security;

-- Users may only mark their own rows read - nothing else. Column-level
-- grants enforce "only read_at", the policies enforce "only own rows".
revoke insert, update, delete on public.notification_inbox from anon, authenticated;
grant update (read_at) on public.notification_inbox to authenticated;

create policy "Users read own inbox" on public.notification_inbox
  for select using (user_id = auth.uid());

create policy "Users mark own inbox read" on public.notification_inbox
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Notices held during quiet hours, sent by the morning run.
create table public.notification_queue (
  id         uuid primary key default gen_random_uuid(),
  event      text not null,
  user_ids   uuid[] not null,
  title      text not null,
  body       text not null,
  url        text,
  tag        text,
  send_after timestamptz not null,
  sent_at    timestamptz,
  created_at timestamptz not null default now()
);

create index notification_queue_due_idx on public.notification_queue (send_after)
  where sent_at is null;

alter table public.notification_queue enable row level security;

create policy "Teachers read notification queue" on public.notification_queue
  for select using (public.is_teacher());

-- Greetings and other notices the teacher schedules ahead.
create table public.scheduled_announcements (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (length(trim(title)) between 1 and 60),
  body        text not null check (length(trim(body)) between 1 and 180),
  audience    text not null check (audience in ('students', 'parents', 'both')),
  -- NULL = every class.
  class_id    uuid references public.classes (id) on delete cascade,
  recurrence  text not null check (recurrence in ('once', 'yearly_date', 'yearly_orthodox_easter')),
  send_on     date,
  send_time   text not null default '10:00'
                check (send_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  enabled     boolean not null default true,
  last_sent_on date,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  constraint scheduled_announcements_date_check check (
    (recurrence = 'yearly_orthodox_easter') = (send_on is null)
  )
);

alter table public.scheduled_announcements enable row level security;

create policy "Teachers manage scheduled announcements" on public.scheduled_announcements
  using (public.is_teacher())
  with check (public.is_teacher());

-- Absence notices waiting for "2 hours after the lesson ends".
create table public.absence_notifications (
  id                   uuid primary key default gen_random_uuid(),
  attendance_record_id uuid not null unique
                         references public.attendance_records (id) on delete cascade,
  student_id           uuid not null references public.students (id) on delete cascade,
  class_id             uuid references public.classes (id) on delete cascade,
  attendance_date      date not null,
  send_at              timestamptz not null,
  sent_at              timestamptz,
  created_at           timestamptz not null default now()
);

create index absence_notifications_due_idx on public.absence_notifications (send_at)
  where sent_at is null;

alter table public.absence_notifications enable row level security;

create policy "Teachers read absence notifications" on public.absence_notifications
  for select using (public.is_teacher());

-- When each job of /api/cron/notifications last ran (shown in the App tab,
-- so the teacher can see whether a frequent scheduler is calling it).
create table public.notification_job_runs (
  job         text primary key,
  last_run_at timestamptz not null default now(),
  forced      boolean not null default false
);

alter table public.notification_job_runs enable row level security;

create policy "Teachers read notification job runs" on public.notification_job_runs
  for select using (public.is_teacher());

-- Reminders fire once per item.
alter table public.homework add column reminder_sent_at timestamptz;
alter table public.assessment_assignments add column reminder_sent_at timestamptz;

-- Quiz deadlines: optional, shown to students and used by the evening
-- reminder. Not enforced - a quiz can still be taken after it.
alter table public.quiz_assignments add column due_date date;
alter table public.quiz_assignments add column reminder_sent_at timestamptz;

-- Per-item opt-out, chosen when the quiz/test is created.
alter table public.quizzes add column notifications_disabled boolean not null default false;
alter table public.assessments add column notifications_disabled boolean not null default false;

-- Mute one class (e.g. a finished exam-prep class).
alter table public.classes add column notifications_muted boolean not null default false;

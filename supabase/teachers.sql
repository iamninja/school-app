-- Establishes an actual authorization boundary for the teacher role. Until
-- now, "is a teacher" meant nothing more than "is logged in" at the app
-- layer - any authenticated student or parent could open /protected/teacher
-- and use its server actions to create their own classes/students/quizzes
-- under their own account. RLS already correctly scopes all of that data by
-- teacher_id = auth.uid(), so this was never a cross-role data leak, but it
-- was a real authorization gap (confirmed by an independent audit,
-- 2026-08-15).
--
-- Idempotent / safe to re-run, matching the style of the other
-- supabase/*.sql files - the user hand-applies these against a live
-- Supabase project.

create table if not exists public.teachers (
  user_id uuid primary key references auth.users(id) on delete cascade
);

alter table public.teachers enable row level security;

-- Authenticated users may only ever check their OWN membership - this
-- table must never leak the full teacher roster to anyone, including a
-- legitimate teacher (not needed for anything today).
drop policy if exists "Users can check their own teacher membership" on public.teachers;

create policy "Users can check their own teacher membership"
  on public.teachers
  for select
  using (user_id = auth.uid());

-- One-time manual step after applying this file: add the teacher account
-- by email (safer than copying a raw UUID out of the Supabase dashboard).
-- Re-run-safe via on conflict.
--
-- insert into public.teachers (user_id)
-- select id from auth.users where email = 'your-teacher-email@example.com'
-- on conflict (user_id) do nothing;

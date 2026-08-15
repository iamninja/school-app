-- Introduces `families` as the billing/household unit (audit finding D1) and
-- soft-delete/withdrawal state (audit finding D4). Previously a parent could
-- only ever have one child - student_parents_email_unique (parent-auth.sql)
-- meant the same parent email could never appear on a second student's
-- rows, so enrolling a sibling hit a raw unique-violation. student_parents
-- becomes family_parents: one row per actual parent PERSON per family,
-- not per student-parent pairing. students.withdrawn_at adds a soft-delete
-- state so a student can be withdrawn without cascading deletes wiping
-- attendance/quiz history (nothing calls a hard delete today - this is
-- built ahead of that need, not migrating an existing one).
--
-- Idempotent / safe to re-run, matching the style of quizzes-decouple.sql -
-- the user hand-applies this against a live Supabase project. Run after
-- teacher-dashboard.sql, parent-auth.sql, parent-rls.sql, student-auth.sql,
-- and quizzes-decouple.sql (all already applied).

-- ---------------------------------------------------------------------
-- 1. families table
-- ---------------------------------------------------------------------
create table if not exists public.families (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.families enable row level security;

-- ---------------------------------------------------------------------
-- 2. students: add family_id + withdrawn_at, backfill one family per
--    existing student. Safe/non-consolidating: student_parents_email_unique
--    already guaranteed no two students shared a parent email, so there is
--    no cross-student household to merge here - purely mechanical.
-- ---------------------------------------------------------------------
alter table public.students
  add column if not exists family_id uuid references public.families(id) on delete restrict,
  add column if not exists withdrawn_at timestamptz;

do $$
declare
  student_row record;
  new_family_id uuid;
begin
  for student_row in
    select id, teacher_id, created_at
    from public.students
    where family_id is null
  loop
    insert into public.families (teacher_id, created_at)
    values (student_row.teacher_id, student_row.created_at)
    returning id into new_family_id;

    update public.students
    set family_id = new_family_id
    where id = student_row.id;
  end loop;
end $$;

alter table public.students alter column family_id set not null;

-- ---------------------------------------------------------------------
-- 3. Drop policies that reference student_parents.student_id before we
--    touch that column. Both live in files already applied to production
--    (teacher-dashboard.sql, student-auth.sql) - drop-and-recreate here
--    rather than editing those historical files.
--
--    Guarded on the table still being named student_parents: `drop policy
--    if exists ... on public.student_parents` is NOT safe to re-run once
--    step 4 has already renamed the table - `if exists` only covers the
--    policy, not the table, so Postgres still errors with
--    "relation public.student_parents does not exist" on a second run.
-- ---------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'student_parents'
  ) then
    execute 'drop policy if exists "Teachers manage parents" on public.student_parents';
    execute 'drop policy if exists "Students view own parent info" on public.student_parents';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 4. Rename student_parents -> family_parents, add family_id, backfill,
--    guarded so a second run of this file no-ops cleanly.
-- ---------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'student_parents'
  ) then
    alter table public.student_parents rename to family_parents;
  end if;
end $$;

alter table public.family_parents
  add column if not exists family_id uuid references public.families(id) on delete cascade;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'family_parents'
      and column_name = 'student_id'
  ) then
    update public.family_parents fp
    set family_id = s.family_id
    from public.students s
    where fp.student_id = s.id
      and fp.family_id is null;
  end if;
end $$;

alter table public.family_parents alter column family_id set not null;

-- Rename the existing unique indexes for clarity now that the table has a
-- new name. Semantics unchanged - email is still globally unique (one
-- email = one login = one parent PERSON; that constraint was never the
-- bug, duplicate per-student rows were).
do $$
begin
  if exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'student_parents_email_unique') then
    alter index public.student_parents_email_unique rename to family_parents_email_unique;
  end if;
  if exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'student_parents_user_id_unique') then
    alter index public.student_parents_user_id_unique rename to family_parents_user_id_unique;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 5. Redefine SECURITY DEFINER helpers to join through family_id BEFORE
--    dropping family_parents.student_id, so there is never a window where
--    a cached function body is broken. Signatures unchanged - other
--    policies across parent-rls.sql / quizzes-decouple.sql / quiz-timer.sql
--    call these by name and must keep working untouched.
-- ---------------------------------------------------------------------
create or replace function public.is_parent_of_student(student_id_param uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.students s
    join public.family_parents fp on fp.family_id = s.family_id
    where s.id = student_id_param
      and fp.user_id = auth.uid()
  );
$$;

create or replace function public.is_parent_of_class(class_id_param uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.student_class_assignments sca
    join public.students s on s.id = sca.student_id
    join public.family_parents fp on fp.family_id = s.family_id
    where sca.class_id = class_id_param
      and fp.user_id = auth.uid()
  );
$$;

-- Rewrites quizzes-decouple.sql's helper, which did its own direct join
-- through student_parents.student_id instead of calling the two helpers
-- above - would silently break once student_id is dropped.
create or replace function public.is_quiz_assigned_to_parent(quiz_id_param uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.quiz_assignments qa
    join public.student_class_assignments sca on sca.class_id = qa.class_id
    join public.students s on s.id = sca.student_id
    join public.family_parents fp on fp.family_id = s.family_id
    where qa.quiz_id = quiz_id_param
      and fp.user_id = auth.uid()
  );
$$;

-- New helper: lets "Parents view own family" (below) check family
-- membership WITHOUT a raw subquery into family_parents, which would
-- reintroduce the exact circular-RLS bug parent-rls.sql was written to fix
-- (families' policy -> family_parents RLS -> "Teachers manage parents"
-- subqueries families again -> infinite recursion). SECURITY DEFINER
-- bypasses family_parents' RLS internally, breaking the cycle.
create or replace function public.is_parent_of_family(family_id_param uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.family_parents
    where family_id = family_id_param
      and user_id = auth.uid()
  );
$$;

revoke all on function public.is_parent_of_student(uuid) from public;
revoke all on function public.is_parent_of_class(uuid) from public;
revoke all on function public.is_quiz_assigned_to_parent(uuid) from public;
revoke all on function public.is_parent_of_family(uuid) from public;
grant execute on function public.is_parent_of_student(uuid) to authenticated;
grant execute on function public.is_parent_of_class(uuid) to authenticated;
grant execute on function public.is_quiz_assigned_to_parent(uuid) to authenticated;
grant execute on function public.is_parent_of_family(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 6. Now safe to drop the old per-student column.
-- ---------------------------------------------------------------------
alter table public.family_parents drop column if exists student_id;

-- ---------------------------------------------------------------------
-- 7. Recreate policies dropped in step 3, now scoped through family_id /
--    families.teacher_id. Drop-and-recreate everything else touched here
--    too, so the whole file is safely re-runnable.
-- ---------------------------------------------------------------------
drop policy if exists "Teachers manage parents" on public.family_parents;
create policy "Teachers manage parents"
  on public.family_parents
  for all
  using (
    exists (
      select 1 from public.families f
      where f.id = family_parents.family_id
        and f.teacher_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.families f
      where f.id = family_parents.family_id
        and f.teacher_id = auth.uid()
    )
  );

-- Safe (not a recursion risk): subqueries into `students`, whose own
-- policies only check auth.uid() directly or call a SECURITY DEFINER
-- function - none of them loop back into family_parents.
drop policy if exists "Students view own parent info" on public.family_parents;
create policy "Students view own parent info"
  on public.family_parents
  for select
  using (
    exists (
      select 1
      from public.students s
      where s.family_id = family_parents.family_id
        and s.user_id = auth.uid()
    )
  );

-- Unchanged semantics, just re-declared for idempotency (didn't reference
-- student_id, so it survived the rename untouched, but re-declaring here
-- keeps this file fully self-contained/re-runnable).
drop policy if exists "Parents view own data" on public.family_parents;
create policy "Parents view own data"
  on public.family_parents
  for select
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- 8. families RLS: teacher CRUD + parent read-only (for completeness / a
--    future mobile client, per the audit - getParentDashboardDataAction
--    still uses the service-role client today and doesn't rely on this).
-- ---------------------------------------------------------------------
drop policy if exists "Teachers manage families" on public.families;
create policy "Teachers manage families"
  on public.families
  for all
  using (teacher_id = auth.uid())
  with check (teacher_id = auth.uid());

drop policy if exists "Parents view own family" on public.families;
create policy "Parents view own family"
  on public.families
  for select
  using (public.is_parent_of_family(id));

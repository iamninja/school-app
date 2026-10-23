-- Attendance for one-off lessons, an optional per-lesson price on them, and
-- a came / no-show mark for trial lessons.
--
-- 1. calendar_events.lesson_price (one-off lessons only): null = not
--    charged. The dialog defaults it to the student's per-lesson class rate
--    when they have one, and leaves it empty for students who only take
--    monthly classes (their tuition already covers extras).
-- 2. calendar_events.trial_outcome (trial lessons only): the teacher's own
--    record - a trial contact has no students row, so there is nothing to
--    take real attendance against, and nothing reaches portals or billing.
-- 3. attendance_records.calendar_event_id: a mark for a one-off lesson
--    belongs to that event, with class_id null and class_name set to the
--    "Ιδιαίτερο μάθημα" snapshot (class_name is NOT NULL since
--    20260819225129). ON DELETE SET NULL, the snapshot convention: deleting
--    the lesson afterwards keeps the student's history and any charge.
-- 4. post_lesson_charge_row() charges a one-off mark at its lesson's price,
--    with the same rules as a per-lesson class (present/late = price,
--    1+1 = half, absent/cleared = nothing). The per-row logic moves into
--    post_lesson_charge() so a price edit can re-post the lesson's existing
--    marks too.

-- 1 + 2 -----------------------------------------------------------------------

alter table public.calendar_events
  add column lesson_price numeric(10, 2)
    check (lesson_price is null or lesson_price > 0),
  add column trial_outcome text
    check (trial_outcome in ('came', 'no_show'));

alter table public.calendar_events
  add constraint calendar_events_lesson_price_type_check
    check (lesson_price is null or event_type = 'ad_hoc_lesson'),
  add constraint calendar_events_trial_outcome_type_check
    check (trial_outcome is null or event_type = 'trial_lesson');

-- 3 ---------------------------------------------------------------------------

alter table public.attendance_records
  add column calendar_event_id uuid
    references public.calendar_events (id) on delete set null;

-- One mark per student per one-off lesson - also the upsert's conflict
-- target. NULLs are distinct, so class marks (calendar_event_id null) never
-- collide here; they keep their own (teacher, class, student, date) key.
alter table public.attendance_records
  add constraint attendance_records_event_student_key
    unique (calendar_event_id, student_id);

-- A mark is for a class lesson or for a one-off lesson, never both.
alter table public.attendance_records
  add constraint attendance_records_class_or_event_check
    check (class_id is null or calendar_event_id is null);

-- 4 ---------------------------------------------------------------------------

-- Posts, updates or removes the lesson charge for one attendance mark.
-- Same body as the tenant-fixed post_lesson_charge_row() (20260909172513),
-- plus the one-off branch. Every lookup is scoped to the mark's own
-- teacher_id, for the reason that migration gives.
create or replace function public.post_lesson_charge(p_record public.attendance_records)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_billing_type text;
  v_rate numeric(10, 2);
  v_family_id uuid;
  v_amount numeric(10, 2);
  v_description text;
begin
  if p_record.calendar_event_id is not null then
    select ce.lesson_price
      into v_rate
    from public.calendar_events ce
    where ce.id = p_record.calendar_event_id
      and ce.teacher_id = p_record.teacher_id
      and ce.event_type = 'ad_hoc_lesson';

    if not found then
      return;
    end if;

    v_billing_type := case when v_rate is not null then 'per_lesson' end;
  else
    select c.billing_type, c.lesson_rate
      into v_billing_type, v_rate
    from public.classes c
    where c.id = p_record.class_id
      and c.teacher_id = p_record.teacher_id;

    if not found then
      return;
    end if;
  end if;

  select s.family_id
    into v_family_id
  from public.students s
  join public.families f on f.id = s.family_id and f.deleted_at is null
  where s.id = p_record.student_id
    and s.teacher_id = p_record.teacher_id;

  if v_billing_type = 'per_lesson'
     and v_rate is not null
     and v_family_id is not null then
    v_amount := case p_record.status
      when 'present' then v_rate
      when 'late'    then v_rate
      when 'split'   then round(v_rate / 2, 2)
      else null
    end;
  end if;

  if v_amount is null then
    delete from public.family_balance_transactions
      where attendance_record_id = p_record.id;
    return;
  end if;

  -- A class mark reads "Μάθημα Β Λυκείου 28/10/2026"; a one-off's
  -- class_name is already "Ιδιαίτερο μάθημα", so it stands on its own.
  v_description :=
    case when p_record.calendar_event_id is not null
      then p_record.class_name
      else 'Μάθημα ' || p_record.class_name
    end
    || ' ' || to_char(p_record.attendance_date, 'DD/MM/YYYY')
    || case when p_record.status = 'split' then ' (1+1)' else '' end;

  insert into public.family_balance_transactions
    (family_id, type, amount, period, description, source, created_by,
     attendance_record_id)
  values (
    v_family_id, 'lesson_charge', v_amount,
    date_trunc('month', p_record.attendance_date)::date,
    v_description, 'attendance', auth.uid(), p_record.id
  )
  on conflict (attendance_record_id) where attendance_record_id is not null
  do update set
    family_id   = excluded.family_id,
    amount      = excluded.amount,
    period      = excluded.period,
    description = excluded.description;
end;
$$;

-- Internal only (SECURITY DEFINER, bypasses RLS): called by the two
-- triggers below, never by the app - same reasoning as
-- 20260905190000_guard-billing-rpcs.sql.
revoke execute on function public.post_lesson_charge(public.attendance_records)
  from public, anon, authenticated;

create or replace function public.post_lesson_charge_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return null;
  end if;

  perform public.post_lesson_charge(new);
  return null;
end;
$$;

-- The existing trigger (attendance_records_post_lesson_charge, "after insert
-- or update of status") keeps calling post_lesson_charge_row(); nothing to
-- recreate.

-- A one-off lesson's price edited (or added/removed) after marks were
-- taken: re-post those marks at the new price.
create or replace function public.reprice_one_off_lesson()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_record public.attendance_records;
begin
  if new.lesson_price is not distinct from old.lesson_price then
    return null;
  end if;

  for v_record in
    select * from public.attendance_records
    where calendar_event_id = new.id
      and teacher_id = new.teacher_id
  loop
    perform public.post_lesson_charge(v_record);
  end loop;

  return null;
end;
$$;

create trigger calendar_events_reprice_one_off_lesson
  after update of lesson_price on public.calendar_events
  for each row execute function public.reprice_one_off_lesson();

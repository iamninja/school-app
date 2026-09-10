-- Per-lesson billing: an alternative to the flat monthly tuition accrual,
-- for a class the teacher charges by the lesson actually taught. A charge
-- is posted the moment attendance is marked present/late (half for a "1+1"
-- split), and removed when the lesson is marked absent (no-show) or the
-- attendance mark is cleared. A cancelled occurrence can't have an
-- attendance row at all (lib/attendance-dates.ts blocks the date), so
-- cancellations need no handling here.
--
-- Nothing about the monthly path changes: billing_type defaults to
-- 'monthly', family_monthly_amount() already coalesces a null
-- tuition_amount to 0, and the monthly_charge unique index is partial on
-- type so lesson_charge rows never collide with it.

-- 1. Per-class billing mode ------------------------------------------------

alter table public.classes
  add column billing_type text not null default 'monthly'
    check (billing_type in ('monthly', 'per_lesson')),
  -- Charge for ONE lesson occurrence, not per hour: the trigger only knows
  -- (class_id, attendance_date) and cannot resolve which slot - or how long
  -- it was - for a class meeting twice on a weekday, an extra_session, or an
  -- ad-hoc lesson. The existing 'split' status already carries the
  -- proportional case (one hour of a two-hour lesson), so a 2-hour class at
  -- 10 EUR/hour is entered as 20 and a 1+1 posts 10.
  add column lesson_rate numeric(10, 2)
    check (lesson_rate is null or lesson_rate > 0);

alter table public.classes
  add constraint classes_lesson_rate_required
  check (billing_type <> 'per_lesson' or lesson_rate is not null);

-- 2. The new ledger row type ----------------------------------------------

alter table public.family_balance_transactions
  drop constraint family_balance_transactions_type_check;
alter table public.family_balance_transactions
  add constraint family_balance_transactions_type_check check (type in (
    'monthly_charge',
    'lesson_charge',   -- accrual, posted by the attendance trigger below
    'payment',
    'receipt',
    'prepayment',
    'adjustment'
  ));

alter table public.family_balance_transactions
  drop constraint family_balance_transactions_sign;
alter table public.family_balance_transactions
  add constraint family_balance_transactions_sign check (
    (type in ('monthly_charge', 'lesson_charge') and amount > 0)
    or (type in ('payment', 'receipt', 'prepayment') and amount < 0)
    or (type = 'adjustment')
  );

alter table public.family_balance_transactions
  drop constraint family_balance_transactions_source_check;
alter table public.family_balance_transactions
  add constraint family_balance_transactions_source_check
  check (source in ('manual', 'cron', 'receipt', 'attendance'));

-- CASCADE, same reasoning as receipt_id: this row is derived bookkeeping,
-- not the event itself. Clearing an attendance mark takes its charge with
-- it and sync_family_balance()'s DELETE branch heals families.balance with
-- no application code at all.
alter table public.family_balance_transactions
  add column attendance_record_id uuid
    references public.attendance_records (id) on delete cascade;

-- Biconditional, mirroring family_balance_transactions_receipt_link: a
-- lesson_charge only ever comes from a marked lesson, and nothing else may
-- claim an attendance row.
alter table public.family_balance_transactions
  add constraint family_balance_transactions_attendance_link check (
    (type = 'lesson_charge') = (attendance_record_id is not null)
  );

-- THE idempotency guarantee, and the ON CONFLICT target below.
create unique index family_balance_transactions_attendance_unique
  on public.family_balance_transactions (attendance_record_id)
  where attendance_record_id is not null;

-- 3. The trigger ----------------------------------------------------------

-- Same shape and rationale as post_receipt_balance_row(): supabase-js has
-- no transaction primitive, so "write the attendance row" and "post the
-- charge" must be one atomic act, and it must cover every present and
-- future writer of attendance_records, not just setAttendanceAction.
create or replace function public.post_lesson_charge_row()
returns trigger
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
  -- PostgREST's upsert always issues ON CONFLICT DO UPDATE with every
  -- column in the SET list, so re-saving an unchanged status fires this
  -- trigger. Returning early keeps a posted charge frozen at the rate it
  -- was posted at: money must not silently reprice because the teacher
  -- re-clicked a button after the rate changed.
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return null;
  end if;

  select c.billing_type, c.lesson_rate
    into v_billing_type, v_rate
  from public.classes c
  where c.id = new.class_id;

  -- Belt-and-braces with the "OF status" trigger scope: the class is gone
  -- (attendance_records.class_id is ON DELETE SET NULL - deleting a class
  -- must never destroy attendance history OR the charges it produced).
  -- Leave any existing charge exactly where it is.
  if not found then
    return null;
  end if;

  select s.family_id
    into v_family_id
  from public.students s
  join public.families f on f.id = s.family_id and f.deleted_at is null
  where s.id = new.student_id;

  if v_billing_type = 'per_lesson'
     and v_rate is not null
     and v_family_id is not null then
    v_amount := case new.status
      when 'present' then v_rate
      when 'late'    then v_rate              -- they showed up; the lesson happened
      when 'split'   then round(v_rate / 2, 2) -- one hour of a two-hour lesson
      else null                                -- 'absent' = no-show: never charged
    end;
  end if;

  if v_amount is null then
    -- Not a per-lesson class (any more), rate cleared, family soft-deleted,
    -- or marked absent: remove the charge if one exists. The balance
    -- trigger restores families.balance.
    delete from public.family_balance_transactions
      where attendance_record_id = new.id;
    return null;
  end if;

  v_description := 'Μάθημα ' || new.class_name || ' '
    || to_char(new.attendance_date, 'DD/MM/YYYY')
    || case when new.status = 'split' then ' (1+1)' else '' end;

  insert into public.family_balance_transactions
    (family_id, type, amount, period, description, source, created_by,
     attendance_record_id)
  values (
    v_family_id, 'lesson_charge', v_amount,
    -- Not an idempotency key here (attendance_record_id is), but it groups
    -- per-lesson charges by month for reporting for free. The monthly_charge
    -- unique index is partial on type, so this can never collide with it,
    -- and preview_family_prepayment() filters on type='monthly_charge'.
    date_trunc('month', new.attendance_date)::date,
    v_description, 'attendance', auth.uid(), new.id
  )
  on conflict (attendance_record_id) where attendance_record_id is not null
  do update set
    family_id   = excluded.family_id,
    amount      = excluded.amount,
    period      = excluded.period,
    description = excluded.description;

  return null;
end;
$$;

-- "OF status" is load-bearing, not decoration: the ON DELETE SET NULL from
-- deleting a class issues an UPDATE that touches only class_id, which must
-- NOT re-evaluate (and therefore delete) historical charges.
create trigger attendance_records_post_lesson_charge
  after insert or update of status on public.attendance_records
  for each row execute function public.post_lesson_charge_row();

-- Fix: post_lesson_charge_row() looked up the class and student by id
-- alone, with no check that they belong to the SAME teacher as the
-- attendance row being written. attendance_records RLS only checks
-- teacher_id = auth.uid() on the row itself, never that class_id/
-- student_id actually belong to that teacher - a pre-existing gap that
-- was harmless before (a stray cross-teacher attendance row was
-- cosmetic), but this SECURITY DEFINER trigger turned it into a real
-- cross-tenant financial write: teacher_id=self with another teacher's
-- class_id/student_id would resolve THAT teacher's billing rate and
-- family, and post a charge into their ledger.
--
-- Not an active risk today (solo teacher), but cheap to close now rather
-- than carry forward into a future multi-teacher design.
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
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return null;
  end if;

  select c.billing_type, c.lesson_rate
    into v_billing_type, v_rate
  from public.classes c
  where c.id = new.class_id
    and c.teacher_id = new.teacher_id;

  if not found then
    return null;
  end if;

  select s.family_id
    into v_family_id
  from public.students s
  join public.families f on f.id = s.family_id and f.deleted_at is null
  where s.id = new.student_id
    and s.teacher_id = new.teacher_id;

  if v_billing_type = 'per_lesson'
     and v_rate is not null
     and v_family_id is not null then
    v_amount := case new.status
      when 'present' then v_rate
      when 'late'    then v_rate
      when 'split'   then round(v_rate / 2, 2)
      else null
    end;
  end if;

  if v_amount is null then
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

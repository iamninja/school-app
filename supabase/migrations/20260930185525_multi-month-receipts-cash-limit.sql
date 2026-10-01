-- Multi-month receipts + the €500 cash limit.
--
-- 1. A receipt may cover a range of billable months at an agreed (possibly
--    discounted) price. On insert, the covered months' monthly charges are
--    posted IMMEDIATELY (tagged with the receipt), and the existing partial
--    unique index on (family_id, period) for type = 'monthly_charge' makes
--    the cron's `on conflict do nothing` skip those months - so the cron
--    needs no change and there is no cron-vs-receipt race by construction.
--    The discount (full price of the range minus the agreed price) is one
--    negative `adjustment`, so a family that pays the agreed price ends up
--    at zero for the range, including any months already charged.
-- 2. Cash payments above 500 EUR are refused (Greek law: 500 or less is
--    allowed in cash). Enforced in the server actions too; these checks are
--    the backstop. NOT VALID: existing rows are not re-checked, new and
--    updated rows are.

-- 1. Receipt columns --------------------------------------------------------

alter table public.receipts
  add column covers_period_start date,
  add column covers_period_end date,
  add column covers_agreed_amount numeric(10, 2);

alter table public.receipts
  add constraint receipts_covers_range check (
    (covers_period_start is null) = (covers_period_end is null)
    and (
      covers_period_start is null
      or (extract(day from covers_period_start) = 1
          and extract(day from covers_period_end) = 1
          and covers_period_end >= covers_period_start
          -- A covering receipt must credit the balance, or the months it
          -- pre-charges could never be paid off by it. family_id is NOT
          -- checked here (it goes null on family delete); the trigger below
          -- requires it at insert time.
          and counts_toward_balance)
    )
  ),
  add constraint receipts_covers_agreed check (
    covers_agreed_amount is null
    or (covers_period_start is not null and covers_agreed_amount > 0)
  );

-- The coverage columns describe what the insert-time trigger posted; editing
-- them afterwards would leave the ledger disagreeing with the receipt.
create or replace function public.receipts_covers_immutable()
returns trigger
language plpgsql
as $$
begin
  if new.covers_period_start is distinct from old.covers_period_start
     or new.covers_period_end is distinct from old.covers_period_end
     or new.covers_agreed_amount is distinct from old.covers_agreed_amount then
    raise exception 'A receipt''s covered months and agreed amount cannot be changed after it is issued';
  end if;
  return new;
end;
$$;

create trigger receipts_covers_immutable
  before update of covers_period_start, covers_period_end, covers_agreed_amount
  on public.receipts
  for each row execute function public.receipts_covers_immutable();

-- 2. Ledger link -------------------------------------------------------------

-- Separate from receipt_id on purpose: receipt_link / receipt_unique keep
-- meaning "the one credit row for this receipt". CASCADE, like receipt_id:
-- these rows are derived bookkeeping (but see the delete trigger below for
-- charges of months that have already started).
alter table public.family_balance_transactions
  add column covering_receipt_id uuid
    references public.receipts (id) on delete cascade;

alter table public.family_balance_transactions
  add constraint family_balance_transactions_covering_types check (
    covering_receipt_id is null or type in ('monthly_charge', 'adjustment')
  );

create index family_balance_transactions_covering_receipt_idx
  on public.family_balance_transactions (covering_receipt_id)
  where covering_receipt_id is not null;

-- 3. Posting the coverage ----------------------------------------------------

create or replace function public.post_receipt_coverage()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family public.families%rowtype;
  v_start_month smallint;
  v_duration smallint;
  v_monthly numeric(10, 2);
  v_cursor date;
  v_gross numeric(10, 2);
  v_discount numeric(10, 2);
begin
  if new.family_id is null then
    raise exception 'A receipt that covers months must be linked to a family';
  end if;

  if new.covers_period_end >= (new.covers_period_start + interval '24 months') then
    raise exception 'A receipt can cover at most 24 months';
  end if;

  -- Tenant guard, same shape as the per-lesson tenant fix: this function is
  -- SECURITY DEFINER, so without it a teacher could post charges into
  -- another teacher's family. auth.uid() is null only for service_role.
  -- Row lock so the gross below is consistent against a concurrent cron run.
  select * into v_family
  from public.families f
  where f.id = new.family_id
    and f.deleted_at is null
    and (auth.uid() is null or f.teacher_id = auth.uid())
  for update;

  if not found then
    raise exception 'Family not found for this receipt';
  end if;

  select coalesce(v_family.billing_start_month, bp.school_year_start_month, 9),
         coalesce(v_family.billing_duration_months, bp.school_year_duration_months, 9)
    into v_start_month, v_duration
  from (select 1) one
  left join public.business_profile bp on bp.id = 1;

  v_monthly := public.family_monthly_amount(new.family_id);
  if v_monthly <= 0 then
    raise exception 'This family has no monthly tuition to cover';
  end if;

  v_cursor := new.covers_period_start;
  while v_cursor <= new.covers_period_end loop
    if public.is_billable_month(extract(month from v_cursor)::smallint, v_start_month, v_duration) then
      insert into public.family_balance_transactions
        (family_id, type, amount, period, description, source, created_by,
         covering_receipt_id)
      values (
        new.family_id, 'monthly_charge', v_monthly, v_cursor,
        'Μηνιαία χρέωση ' || to_char(v_cursor, 'MM/YYYY'),
        'receipt', auth.uid(), new.id
      )
      -- A month the cron (or an earlier run) already charged keeps its row
      -- and its real amount; it simply counts toward the gross below.
      on conflict do nothing;
    end if;
    v_cursor := (v_cursor + interval '1 month')::date;
  end loop;

  select coalesce(sum(t.amount), 0) into v_gross
  from public.family_balance_transactions t
  where t.family_id = new.family_id
    and t.type = 'monthly_charge'
    and t.period between new.covers_period_start and new.covers_period_end;

  if v_gross <= 0 then
    raise exception 'No billable months in the selected range';
  end if;

  if new.covers_agreed_amount is not null then
    if new.covers_agreed_amount > v_gross then
      raise exception 'The agreed amount cannot exceed the full price of the covered months';
    end if;

    v_discount := v_gross - new.covers_agreed_amount;
    if v_discount > 0 then
      insert into public.family_balance_transactions
        (family_id, type, amount, period, description, source, created_by,
         covering_receipt_id)
      values (
        new.family_id, 'adjustment', -v_discount, new.covers_period_start,
        'Έκπτωση ' || to_char(new.covers_period_start, 'MM/YYYY') || ' – '
          || to_char(new.covers_period_end, 'MM/YYYY')
          || ' (απόδειξη ' || new.series || new.receipt_number || ')',
        'receipt', auth.uid(), new.id
      );
    end if;
  end if;

  return null;
end;
$$;

create trigger receipts_post_coverage
  after insert on public.receipts
  for each row
  when (new.covers_period_start is not null)
  execute function public.post_receipt_coverage();

-- Deleting a covering receipt: charges for months that have already started
-- stay (the cron only ever posts the current period, so it would never
-- re-create them); future months and the discount cascade away, so the
-- family is back to what it was before the receipt.
create or replace function public.receipts_keep_started_charges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.family_balance_transactions
    set covering_receipt_id = null
    where covering_receipt_id = old.id
      and type = 'monthly_charge'
      and period <= date_trunc('month', now() at time zone 'Europe/Athens')::date;
  return old;
end;
$$;

create trigger receipts_keep_started_charges
  before delete on public.receipts
  for each row execute function public.receipts_keep_started_charges();

-- The receipt-credit trigger looks its row up by receipt_id alone; make that
-- explicit about the type so it can never pick up any other row that ever
-- carries a receipt_id.
create or replace function public.post_receipt_balance_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing_id uuid;
begin
  select id into v_existing_id
  from public.family_balance_transactions
  where receipt_id = new.id and type = 'receipt';

  if new.family_id is not null and new.total_amount > 0 and new.counts_toward_balance then
    if v_existing_id is null then
      insert into public.family_balance_transactions
        (family_id, type, amount, description, receipt_id, payment_method, source)
      values (
        new.family_id, 'receipt', -new.total_amount,
        'Απόδειξη ' || new.series || new.receipt_number,
        new.id, new.payment_method, 'receipt'
      );
    else
      update public.family_balance_transactions
        set family_id = new.family_id,
            amount = -new.total_amount,
            payment_method = new.payment_method
        where id = v_existing_id;
    end if;
  elsif v_existing_id is not null then
    delete from public.family_balance_transactions where id = v_existing_id;
  end if;

  return null;
end;
$$;

-- 4. Preview for the receipt form --------------------------------------------

create or replace function public.preview_receipt_coverage(
  p_family_id uuid, p_start date, p_end date
) returns table (
  periods date[],
  monthly_amount numeric,
  already_posted_total numeric,
  new_charges_total numeric,
  gross numeric,
  balance numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_family public.families%rowtype;
  v_start_month smallint;
  v_duration smallint;
  v_monthly numeric(10, 2);
  v_cursor date;
  v_periods date[] := array[]::date[];
  v_posted numeric(10, 2);
  v_new numeric(10, 2) := 0;
begin
  if not (public.is_teacher() or auth.uid() is null) then
    raise exception 'Not authorized to preview receipt coverage';
  end if;

  if extract(day from p_start) <> 1 or extract(day from p_end) <> 1 or p_end < p_start then
    raise exception 'Invalid month range';
  end if;
  if p_end >= (p_start + interval '24 months') then
    raise exception 'A receipt can cover at most 24 months';
  end if;

  select * into v_family
  from public.families f
  where f.id = p_family_id
    and f.deleted_at is null
    and (auth.uid() is null or f.teacher_id = auth.uid());

  if not found then
    raise exception 'Family not found';
  end if;

  select coalesce(v_family.billing_start_month, bp.school_year_start_month, 9),
         coalesce(v_family.billing_duration_months, bp.school_year_duration_months, 9)
    into v_start_month, v_duration
  from (select 1) one
  left join public.business_profile bp on bp.id = 1;

  v_monthly := public.family_monthly_amount(p_family_id);

  v_cursor := p_start;
  while v_cursor <= p_end loop
    if public.is_billable_month(extract(month from v_cursor)::smallint, v_start_month, v_duration) then
      v_periods := v_periods || v_cursor;
      if not exists (
        select 1 from public.family_balance_transactions t
        where t.family_id = p_family_id and t.type = 'monthly_charge' and t.period = v_cursor
      ) then
        v_new := v_new + v_monthly;
      end if;
    end if;
    v_cursor := (v_cursor + interval '1 month')::date;
  end loop;

  select coalesce(sum(t.amount), 0) into v_posted
  from public.family_balance_transactions t
  where t.family_id = p_family_id
    and t.type = 'monthly_charge'
    and t.period between p_start and p_end;

  return query select v_periods, v_monthly, v_posted, v_new, (v_posted + v_new)::numeric,
    v_family.balance::numeric;
end;
$$;

revoke all on function public.preview_receipt_coverage(uuid, date, date) from public, anon;
grant execute on function public.preview_receipt_coverage(uuid, date, date) to authenticated, service_role;

-- 5. Cash limit backstop -------------------------------------------------------

alter table public.receipts
  add constraint receipts_cash_limit
  check (payment_method <> 3 or total_amount <= 500) not valid;

-- Receipt credit rows mirror their receipt (covered above); informal
-- payments and prepayments carry their own method.
alter table public.family_balance_transactions
  add constraint family_balance_transactions_cash_limit
  check (
    type not in ('payment', 'prepayment')
    or payment_method is distinct from 3
    or amount >= -500
  ) not valid;

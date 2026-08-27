-- The monthly charge run: one Postgres function called by BOTH the cron
-- route and the manual "Apply this month's charges" server action (see
-- lib/billing/monthly-charge-run.ts) - one implementation, two callers,
-- so the cron is never a single point of failure and never diverges from
-- what the manual button does.

-- A family's current monthly charge: sum of active (non-withdrawn)
-- students' tuition_amount. coalesce(tuition_amount, 0) - a student with
-- no amount set contributes nothing; never invent a charge from missing
-- data.
create or replace function public.family_monthly_amount(p_family_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(coalesce(s.tuition_amount, 0)), 0)::numeric(10, 2)
  from public.students s
  where s.family_id = p_family_id and s.withdrawn_at is null;
$$;

revoke all on function public.family_monthly_amount(uuid) from public, anon;
grant execute on function public.family_monthly_amount(uuid) to authenticated, service_role;

-- Run observability: the manual button exists specifically so the cron
-- is never a single point of failure, which requires being able to SEE
-- whether it ran. Every run is logged, including no-ops (~365 rows/year
-- is nothing, and "did it run yesterday?" must be answerable).
create table public.family_charge_runs (
  id uuid primary key default gen_random_uuid(),
  period date not null,
  ran_at timestamptz not null default now(),
  source text not null check (source in ('cron', 'manual')),
  billable boolean not null,
  families_charged integer not null default 0,
  total_amount numeric(10, 2) not null default 0,
  skipped_reason text check (skipped_reason in ('not_a_billable_month', 'no_families_with_charges')),
  error text,
  triggered_by uuid references auth.users (id) on delete set null
);

alter table public.family_charge_runs enable row level security;

-- Teacher-only, matching receipts/expenses - no parent policy, run
-- bookkeeping isn't a parent's business.
create policy "Teachers manage charge runs" on public.family_charge_runs
  using (public.is_teacher())
  with check (public.is_teacher());

create index family_charge_runs_ran_at_idx on public.family_charge_runs (ran_at desc);

-- The orchestrator. SECURITY DEFINER because the cron path has no user
-- session at all (service-role calls this directly) - its protection is
-- the cron route's shared-secret gate plus this explicit guard: a parent
-- account (which has auth.uid() set, is never a teacher, and is never
-- service_role) is refused outright rather than relying on RLS, since
-- this function bypasses RLS by virtue of being definer.
create or replace function public.post_monthly_family_charges(
  p_period date,
  p_source text,
  p_triggered_by uuid default null
) returns table (
  period date,
  billable boolean,
  families_charged integer,
  total_amount numeric,
  skipped_reason text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_start_month smallint;
  v_duration smallint;
  v_month smallint := extract(month from p_period)::smallint;
  v_billable boolean;
  v_count integer;
  v_total numeric(10, 2);
begin
  if not (public.is_teacher() or auth.uid() is null) then
    raise exception 'Not authorized to post monthly charges';
  end if;

  select coalesce(bp.school_year_start_month, 9), coalesce(bp.school_year_duration_months, 9)
    into v_start_month, v_duration
  from public.business_profile bp where bp.id = 1;

  if v_start_month is null then
    v_start_month := 9;
    v_duration := 9;
  end if;

  -- Run-level "billable" reflects the business-wide default window, for
  -- UI messaging - a per-family billing_start_month/duration_months
  -- override can still charge (or skip) an individual family regardless
  -- of this flag; the insert below always respects the per-family
  -- override via coalesce.
  v_billable := public.is_billable_month(v_month, v_start_month, v_duration);

  with charged as (
    insert into public.family_balance_transactions
      (family_id, type, amount, period, description, source, created_by)
    select
      f.id, 'monthly_charge', m.amount, p_period,
      'Μηνιαία χρέωση ' || to_char(p_period, 'MM/YYYY'), p_source, p_triggered_by
    from public.families f
    cross join lateral (select public.family_monthly_amount(f.id) as amount) m
    where f.deleted_at is null
      and m.amount > 0
      and public.is_billable_month(
            v_month,
            coalesce(f.billing_start_month, v_start_month),
            coalesce(f.billing_duration_months, v_duration))
    on conflict do nothing
    returning family_id, amount
  )
  select count(*), coalesce(sum(amount), 0) into v_count, v_total from charged;

  insert into public.family_charge_runs
    (period, source, billable, families_charged, total_amount, skipped_reason, triggered_by)
  values (
    p_period, p_source, v_billable, v_count, v_total,
    case when v_count > 0 then null
         when not v_billable then 'not_a_billable_month'
         else 'no_families_with_charges' end,
    p_triggered_by
  );

  return query select p_period, v_billable, v_count, v_total,
    case when v_count > 0 then null
         when not v_billable then 'not_a_billable_month'
         else 'no_families_with_charges' end;
end;
$$;

revoke all on function public.post_monthly_family_charges(date, text, uuid) from public, anon;
grant execute on function public.post_monthly_family_charges(date, text, uuid) to authenticated, service_role;

-- "Prepay N months" preview/commit arithmetic - kept in Postgres so no
-- money multiplication ever happens in JS float math. Returns the next N
-- BILLABLE (not calendar) periods strictly after the family's latest
-- posted monthly_charge, or starting from the current period if none
-- exists yet.
create or replace function public.preview_family_prepayment(p_family_id uuid, p_months integer)
returns table (periods date[], monthly_amount numeric, total numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_start_month smallint;
  v_duration smallint;
  v_cursor date;
  v_month smallint;
  v_amount numeric(10, 2);
  v_periods date[] := array[]::date[];
begin
  select coalesce(f.billing_start_month, coalesce(bp.school_year_start_month, 9)),
         coalesce(f.billing_duration_months, coalesce(bp.school_year_duration_months, 9))
    into v_start_month, v_duration
  from public.families f
  left join public.business_profile bp on bp.id = 1
  where f.id = p_family_id;

  select coalesce(max(t.period), date_trunc('month', now() at time zone 'Europe/Athens')::date)
    into v_cursor
  from public.family_balance_transactions t
  where t.family_id = p_family_id and t.type = 'monthly_charge';

  while array_length(v_periods, 1) is null or array_length(v_periods, 1) < p_months loop
    v_cursor := v_cursor + interval '1 month';
    v_month := extract(month from v_cursor)::smallint;
    if public.is_billable_month(v_month, v_start_month, v_duration) then
      v_periods := v_periods || v_cursor;
    end if;
  end loop;

  v_amount := public.family_monthly_amount(p_family_id);

  return query select v_periods, v_amount, (v_amount * p_months)::numeric(10, 2);
end;
$$;

revoke all on function public.preview_family_prepayment(uuid, integer) from public, anon;
grant execute on function public.preview_family_prepayment(uuid, integer) to authenticated, service_role;

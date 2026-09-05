-- Opus security audit finding H1, 2026-09-05: three SECURITY DEFINER
-- billing functions were granted to `authenticated` with no authorization
-- check in the body at all - unlike their sibling
-- post_monthly_family_charges (same migration set), which already guards
-- itself with `if not (is_teacher() or auth.uid() is null) then raise`.
-- Being SECURITY DEFINER, all three bypass RLS entirely, so any logged-in
-- student/parent could call them directly against any family_id (not just
-- their own) - readable/writable financial data with no ownership check.

-- recompute_family_balance: a drift-repair/verification tool, never called
-- by the app - only ever invoked via a service-role client, both in
-- production tooling and in tests/rls/family-balance.test.ts's drift
-- assertion. No legitimate `authenticated` caller exists, so the cleanest
-- fix is removing that grant entirely rather than adding a body guard.
revoke execute on function public.recompute_family_balance(uuid) from authenticated;

-- family_monthly_amount: same story - only ever called internally by
-- post_monthly_family_charges/preview_family_prepayment (both themselves
-- SECURITY DEFINER, so the internal call runs under the defining role
-- regardless of this grant), never directly via `.rpc(...)` from app code
-- or tests.
revoke execute on function public.family_monthly_amount(uuid) from authenticated;

-- preview_family_prepayment IS called directly by the app as `authenticated`
-- (previewFamilyPrepaymentAction, a real teacher session) and by the RLS
-- test suite via a service-role client (auth.uid() is null there) - so
-- unlike the two functions above, this one keeps its `authenticated` grant
-- and instead gets the same guard post_monthly_family_charges already has.
-- (While already touching this body: also bounds p_months, closing audit
-- finding M3 - the app-layer 1-12 validation in
-- previewFamilyPrepaymentAction was the only thing enforcing that, and this
-- function is reachable directly by any authenticated caller regardless of
-- that action's own validation.)
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
  if not (public.is_teacher() or auth.uid() is null) then
    raise exception 'Not authorized to preview a prepayment';
  end if;

  if p_months < 1 or p_months > 24 then
    raise exception 'p_months must be between 1 and 24';
  end if;

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

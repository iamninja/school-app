-- Which calendar months tuition accrues for. The Greek school year runs
-- September-May (9 months); no charge should post in June/July/August by
-- default.
--
-- Three tiers, because the charge is per-FAMILY (sum of active students'
-- tuition_amount) while the requested field was per-class - a per-class
-- duration can't be the billing gate on its own: a family with children
-- in a 9-month class and a 4-month class has no defined answer for which
-- duration wins.

-- 1. Business-wide default - the actual gate the charge run consults.
alter table public.business_profile
  add column school_year_start_month smallint not null default 9
    check (school_year_start_month between 1 and 12),
  add column school_year_duration_months smallint not null default 9
    check (school_year_duration_months between 1 and 12);

-- 2. Per-family override. Null means "use the business default" - this
-- is the right place for an exception, since the charge is computed per
-- family (e.g. a family doing only a summer exam sprint).
alter table public.families
  add column billing_start_month smallint
    check (billing_start_month is null or billing_start_month between 1 and 12),
  add column billing_duration_months smallint
    check (billing_duration_months is null or billing_duration_months between 1 and 12);

-- 3. Per-class session length, as literally requested. Descriptive
-- metadata only - it does NOT gate billing (see above for why), but it's
-- real information about a class and the natural input if per-class
-- pricing ever replaces per-student tuition_amount.
alter table public.classes
  add column duration_months smallint not null default 9
    check (duration_months between 1 and 12);

-- Billable months are a calendar MONTH-SET, computed mod 12 - not an
-- enrollment anchor ("9 months from when they joined"). An anchor model
-- is wrong for a school-year business: a family enrolling in January
-- would be charged through the following September, straddling summer
-- and running into the next school year. The month-set model handles
-- mid-year enrollment with no special case at all - a family created in
-- January is simply charged in January (in the set) and stops in June
-- (not in the set). September is never hardcoded; it's a default value
-- in one column.
--
-- Mirrored in TS as isBillableMonth() (lib/billing/school-year.ts) for
-- the UI - a cross-implementation parity test in tests/rls/ sweeps both
-- over every (month, start, duration) combination so having the rule in
-- two places is defensible.
create or replace function public.is_billable_month(
  p_month smallint, p_start_month smallint, p_duration smallint
) returns boolean
language sql
immutable
as $$
  select ((p_month - p_start_month + 12) % 12) < p_duration;
$$;

-- Family balance ledger. Every family owes and pays through this table -
-- it is the source of truth; families.balance (next migration) is a
-- materialized, trigger-maintained cache of sum(amount) for fast reads.
--
-- amount is SIGNED, not type-implied: positive = family owes more,
-- negative = owes less. One invariant everywhere (balance = sum(amount))
-- rather than every reader (trigger, UI, tests) reimplementing
-- type -> sign, which is exactly the kind of thing that silently drifts.

create table public.family_balance_transactions (
  id uuid primary key default gen_random_uuid(),

  family_id uuid not null references public.families (id) on delete restrict,

  type text not null check (type in (
    'monthly_charge',  -- accrual, posted by the charge run (cron or manual)
    'payment',         -- informal payment, no receipt issued
    'receipt',         -- credit posted automatically when a receipt is issued
    'prepayment',      -- explicit advance payment covering N billable months
    'adjustment'       -- manual correction / discount / write-off, either sign
  )),

  amount numeric(10, 2) not null check (amount <> 0),

  -- First day of the billed month, e.g. 2026-10-01. Required for
  -- monthly_charge (it IS the idempotency key, see the unique index
  -- below) and prepayment (start of the covered range). Optional
  -- elsewhere - a teacher may tag an informal payment "for October"
  -- without it meaning anything mechanically.
  period date check (period is null or extract(day from period) = 1),
  -- Prepayment only: last covered billable period, inclusive.
  period_end date check (period_end is null or extract(day from period_end) = 1),
  covers_months smallint check (covers_months is null or covers_months between 1 and 24),

  description text not null check (length(btrim(description)) > 0),

  -- CASCADE, deliberately unlike receipts.family_id's SET NULL. That one
  -- preserves a legal document when its family goes away; this row is
  -- derived bookkeeping. Deleting a not-yet-transmitted receipt should
  -- take its credit with it - the balance trigger's DELETE branch makes
  -- families.balance self-heal.
  receipt_id uuid references public.receipts (id) on delete cascade,
  -- Same AADE payment-method codes as receipts.payment_method /
  -- expenses.payment_method.
  payment_method integer check (payment_method in (1, 2, 3, 4, 5, 6, 7, 8)),

  source text not null default 'manual' check (source in ('manual', 'cron', 'receipt')),
  -- Null for cron-posted rows: no user session exists there.
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),

  -- The sign convention, enforced rather than merely documented.
  constraint family_balance_transactions_sign check (
    (type = 'monthly_charge' and amount > 0)
    or (type in ('payment', 'receipt', 'prepayment') and amount < 0)
    or (type = 'adjustment')  -- either sign: a discount and a late fee are both adjustments
  ),
  constraint family_balance_transactions_charge_period check (
    type <> 'monthly_charge' or period is not null
  ),
  constraint family_balance_transactions_prepayment_range check (
    type <> 'prepayment'
    or (period is not null and period_end is not null
        and covers_months is not null and period_end >= period)
  ),
  constraint family_balance_transactions_receipt_link check (
    (type = 'receipt') = (receipt_id is not null)
  )
);

-- THE idempotency guarantee: (family_id, period) can exist at most once
-- for a monthly_charge, full stop - no read-then-write race between the
-- cron firing and the teacher clicking the manual button at the same
-- moment. Partial, so payments/adjustments/prepayments in the same month
-- are unconstrained.
create unique index family_balance_transactions_monthly_charge_unique
  on public.family_balance_transactions (family_id, period)
  where type = 'monthly_charge';

-- One ledger row per receipt, ever.
create unique index family_balance_transactions_receipt_unique
  on public.family_balance_transactions (receipt_id)
  where receipt_id is not null;

create index family_balance_transactions_family_created_idx
  on public.family_balance_transactions (family_id, created_at desc);

alter table public.family_balance_transactions enable row level security;

-- Same shape as "Teachers manage parents" (harden-teacher-rls): ownership
-- through the parent table, AND an explicit is_teacher() so a
-- student/parent account that bypassed the app-layer gate can't write
-- under its own auth.uid().
create policy "Teachers manage family balance transactions"
  on public.family_balance_transactions
  using ((exists (
      select 1 from public.families f
      where f.id = family_balance_transactions.family_id
        and f.teacher_id = auth.uid())) and public.is_teacher())
  with check ((exists (
      select 1 from public.families f
      where f.id = family_balance_transactions.family_id
        and f.teacher_id = auth.uid())) and public.is_teacher());

-- Parents see their own family's ledger. SELECT only - no write policy
-- exists, so a parent cannot manufacture a payment. No student policy:
-- family finances aren't a child's business, matching families itself
-- (which has no student policy either).
create policy "Parents view own family balance transactions"
  on public.family_balance_transactions
  for select
  using (public.is_parent_of_family(family_id));

-- families.balance: a materialized, trigger-maintained cache of
-- sum(amount) over this family's ledger. A column, not a view - it's
-- covered by families' EXISTING two RLS policies for free the moment it
-- exists (teacher CRUD, parent SELECT), and PostgREST can embed/sort/
-- filter on it trivially, unlike a fabricated FK relationship onto an
-- aggregate view. Note this cuts both ways: any future column added to
-- families is immediately parent-visible, so nothing should land there
-- that a parent shouldn't see.
alter table public.families
  add column balance numeric(10, 2) not null default 0,
  add column balance_updated_at timestamptz;

-- Kept in sync by a trigger, not application code: supabase-js has no
-- transaction primitive (every write is a separate HTTP call through
-- PostgREST), and there will be four writers of
-- family_balance_transactions (the cron via service-role, three teacher
-- actions, and the receipts trigger added in a later migration). A
-- trigger is the only mechanism that keeps "balance = sum(amount)" true
-- by construction regardless of who's writing. Deltas, not sum(), so
-- each update is O(1) and never takes a table-wide read lock.
create or replace function public.sync_family_balance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.families
      set balance = balance + new.amount, balance_updated_at = now()
      where id = new.family_id;
  elsif tg_op = 'DELETE' then
    update public.families
      set balance = balance - old.amount, balance_updated_at = now()
      where id = old.family_id;
  else -- UPDATE
    if new.family_id is distinct from old.family_id then
      update public.families
        set balance = balance - old.amount, balance_updated_at = now()
        where id = old.family_id;
      update public.families
        set balance = balance + new.amount, balance_updated_at = now()
        where id = new.family_id;
    elsif new.amount is distinct from old.amount then
      update public.families
        set balance = balance + (new.amount - old.amount), balance_updated_at = now()
        where id = new.family_id;
    end if;
  end if;
  return null; -- AFTER trigger
end;
$$;

create trigger family_balance_transactions_sync_balance
  after insert or update or delete on public.family_balance_transactions
  for each row execute function public.sync_family_balance();

-- Drift-repair / verification tool, exercised by the RLS test suite's
-- drift-invariant assertion. Not called anywhere in the app by default.
create or replace function public.recompute_family_balance(p_family_id uuid)
returns numeric
language sql
volatile
security definer
set search_path = public
as $$
  update public.families f
    set balance = coalesce((
      select sum(t.amount) from public.family_balance_transactions t
      where t.family_id = f.id), 0),
      balance_updated_at = now()
  where f.id = p_family_id
  returning f.balance;
$$;

revoke all on function public.recompute_family_balance(uuid) from public, anon;
grant execute on function public.recompute_family_balance(uuid) to authenticated, service_role;

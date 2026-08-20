-- Receipts (Αποδείξεις Παροχής Υπηρεσιών).
--
-- Like business_profile, these are NOT scoped per-teacher: a receipt is
-- issued by the business to a family, not by a specific teacher (the
-- 2026-08-15 billing decision). No teacher_id column; is_teacher() gates
-- access, same as the other business tables.
--
-- myDATA transmission columns exist from the start but are unused until
-- that pass lands - a receipt is a valid local financial record whether or
-- not AADE ever accepts it, which is exactly why status is a retryable
-- column rather than transmission being a precondition for saving.

create table public.receipts (
  id uuid primary key default gen_random_uuid(),
  series text not null default 'Α',
  receipt_number integer not null,
  issue_date date not null default current_date,

  -- Snapshotted, not joined. A receipt is a legal record of what was
  -- issued on the day; later edits to a family's contact details must not
  -- retroactively change an issued receipt. Same reasoning as
  -- quiz_attempts.quiz_title / attendance_records.class_name.
  recipient_name text not null,
  recipient_afm text,
  recipient_address text,

  -- Optional convenience link for prefill and future reconciliation. Set
  -- null on family delete: the snapshot above keeps the receipt intact.
  family_id uuid references public.families (id) on delete set null,

  total_amount numeric(10, 2) not null check (total_amount >= 0),
  -- Kept as a column rather than hardcoded, so a future non-exempt case
  -- doesn't need a migration. Default is the Article 22 tutoring exemption.
  vat_category text not null default 'exempt_article_22',
  notes text,

  mydata_status text not null default 'not_submitted'
    check (mydata_status in ('not_submitted', 'submitted', 'failed')),
  mydata_mark text,
  mydata_uid text,
  mydata_error text,
  mydata_submitted_at timestamptz,

  emailed_at timestamptz,
  created_at timestamptz not null default now(),

  unique (series, receipt_number)
);

alter table public.receipts enable row level security;

create policy "Teachers manage receipts" on public.receipts
  using (public.is_teacher())
  with check (public.is_teacher());

create table public.receipt_line_items (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.receipts (id) on delete cascade,
  -- RESTRICT, never cascade: destroying a student row must not silently
  -- destroy the financial record of what they were billed for (TODO item
  -- from the 2026-08-15 Opus audit). Safe in practice - this app never
  -- hard-deletes students, it sets withdrawn_at.
  student_id uuid references public.students (id) on delete restrict,
  description text not null,
  amount numeric(10, 2) not null check (amount >= 0),
  order_index integer not null default 0
);

alter table public.receipt_line_items enable row level security;

create policy "Teachers manage receipt line items" on public.receipt_line_items
  using (public.is_teacher())
  with check (public.is_teacher());

create index receipt_line_items_receipt_id_idx
  on public.receipt_line_items (receipt_id);

-- Receipt numbering must be gapless and collision-free per series: two
-- browser tabs issuing at once, or a client-side max()+1, would produce
-- duplicates or gaps, and both matter legally. This is the atomic version.
create table public.receipt_number_counters (
  series text primary key,
  next_number integer not null default 1
);

alter table public.receipt_number_counters enable row level security;

create policy "Teachers manage receipt counters" on public.receipt_number_counters
  using (public.is_teacher())
  with check (public.is_teacher());

-- Deliberately NOT security definer: running as the caller keeps the
-- "Teachers manage receipt counters" policy in force, so a student or
-- parent account can't burn receipt numbers. The upsert is atomic either
-- way - it takes a row lock - so concurrency is safe without it.
--
-- Returns the number just allocated. `next_number - 1` is correct in both
-- branches: a fresh series inserts 2 and returns 1; an existing series at
-- N sets N+1 and returns N.
create or replace function public.next_receipt_number(p_series text)
returns integer
language sql
volatile
as $$
  insert into public.receipt_number_counters (series, next_number)
  values (p_series, 2)
  on conflict (series) do update
    set next_number = public.receipt_number_counters.next_number + 1
  returning next_number - 1;
$$;

revoke all on function public.next_receipt_number(text) from public, anon;
grant execute on function public.next_receipt_number(text) to authenticated, service_role;

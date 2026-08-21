-- Business expense log: internal bookkeeping, deliberately NOT a myDATA
-- transmission feature. SendExpensesClassification (spec §4.2.3) requires
-- an invoiceMark for a document that already exists in myDATA - it
-- classifies a document, it doesn't create one. For expenses the business
-- is the recipient, not the issuer, so there's no equivalent of receipts'
-- "build the XML and POST it" flow until it's clear whether/how suppliers
-- transmit their own invoices. No mydata_* columns for the same reason
-- receipts.vat_category exists as a plain column: adding speculative
-- schema for a mechanism that isn't understood yet would likely need
-- reworking once it is.
--
-- Same ownership shape as receipts/business_profile: no teacher_id, one
-- business regardless of how many teacher accounts exist.

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  expense_date date not null default current_date,
  supplier_name text not null,
  -- Not required now, but worth capturing per-row: it's the join key a
  -- future myDATA classification pass would need to match this row
  -- against a supplier-transmitted document from RequestDocs.
  supplier_afm text,
  description text not null,
  -- Gross, what was actually paid. net = amount - vat_amount.
  amount numeric(10, 2) not null check (amount >= 0),
  vat_amount numeric(10, 2) check (vat_amount >= 0),
  -- AADE's own category2_x identifier (spec §8.10), stored now so a
  -- future classification pass isn't starting from a blank field.
  category text,
  -- Same AADE payment-method codes as receipts.payment_method, optional
  -- here since it's not legally load-bearing on the recipient side.
  payment_method integer check (payment_method in (1, 2, 3, 4, 5, 6, 7, 8)),
  notes text,
  created_at timestamptz not null default now()
);

alter table public.expenses enable row level security;

create policy "Teachers manage expenses" on public.expenses
  using (public.is_teacher())
  with check (public.is_teacher());

create index expenses_expense_date_idx on public.expenses (expense_date desc);

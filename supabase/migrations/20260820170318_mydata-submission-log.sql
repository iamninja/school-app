-- Audit trail of every myDATA transmission attempt, not just the latest.
--
-- receipts.mydata_status holds the current state; this holds the history.
-- For a tax filing, "we tried three times and these are the errors we got"
-- is the thing you actually need when reconciling with AADE, and a single
-- mydata_error column overwrites that on each retry.
--
-- Together, receipts.mydata_status + this table ARE the durable retry
-- queue (TODO item: "durable background job, not fire-and-forget"). Retry
-- is teacher-triggered from the UI rather than a cron worker, which is
-- proportionate at one-teacher volume; a scheduled retry can be layered on
-- later without changing this shape.

create table public.mydata_submission_log (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.receipts (id) on delete cascade,
  attempted_at timestamptz not null default now(),
  environment text not null check (environment in ('sandbox', 'production')),
  success boolean not null,
  mark text,
  -- Error text only. Deliberately not the raw request: that would archive
  -- the full invoice payload on every attempt for no benefit.
  error text
);

alter table public.mydata_submission_log enable row level security;

create policy "Teachers manage mydata submission log" on public.mydata_submission_log
  using (public.is_teacher())
  with check (public.is_teacher());

create index mydata_submission_log_receipt_id_idx
  on public.mydata_submission_log (receipt_id, attempted_at desc);

-- Which environment a receipt was filed against is part of its permanent
-- record: a MARK from sandbox is not a real filing, and without this there
-- is no way to tell the two apart after the fact.
alter table public.receipts add column mydata_environment text
  check (mydata_environment in ('sandbox', 'production'));

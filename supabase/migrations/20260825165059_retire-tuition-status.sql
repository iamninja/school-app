-- Retires students.tuition_status - a hand-maintained free-text guess at
-- a fact the family balance ledger now knows exactly (see
-- lib/billing/tuition-status.ts, deriveTuitionStatus). No app code reads
-- or writes this column as of this migration; safe to drop.
--
-- tuition_amount is KEPT and promoted from decorative to load-bearing -
-- it's now the input summed into family_monthly_amount() for the whole
-- billing feature - so it gets the constraint it never had.

alter table public.students
  add constraint students_tuition_amount_nonneg
  check (tuition_amount is null or tuition_amount >= 0);

alter table public.students drop column tuition_status;

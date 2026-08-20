-- AADE's sandbox validator rejected our first transmissions with
-- "Payment Methods is mandatory for this invoice type" - paymentMethods
-- is required for 11.2, even though the XSD marks it optional globally
-- (the per-invoice-type rules are stricter than the schema).
--
-- Stored rather than hardcoded: how the customer actually paid is part of
-- the tax record, so defaulting every receipt to "cash" would mean filing
-- something untrue whenever they paid by card.
--
-- Codes are AADE's own (spec §8.12): 3 = Μετρητά, 6 = Web Banking,
-- 7 = POS / e-POS, 8 = Άμεσες Πληρωμές IRIS. Constrained to the values a
-- tutoring centre can plausibly be paid by, rather than the full list.

alter table public.receipts
  add column payment_method integer not null default 3
    check (payment_method in (1, 2, 3, 4, 5, 6, 7, 8));

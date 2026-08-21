-- "Verify with AADE": re-queries RequestTransmittedDocs for a receipt's
-- own MARK, so "our database says submitted" and "AADE actually holds
-- this filing" can never silently drift apart.
--
-- Reuses mydata_submission_log rather than a new table - a verify
-- attempt is the same shape as a submit attempt (environment, success,
-- mark, error), just a different kind of event.

alter table public.mydata_submission_log
  add column kind text not null default 'submit'
    check (kind in ('submit', 'verify'));

alter table public.receipts
  add column mydata_last_verified_at timestamptz,
  add column mydata_last_verified_ok boolean;

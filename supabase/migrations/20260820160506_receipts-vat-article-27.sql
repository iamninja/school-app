-- ν. 5144/2024 renumbered the VAT Code: the exemption our receipts rely on
-- moved from άρθρο 22 (ν. 2859/2000) to άρθρο 27. Confirmed against the
-- official AADE spec §8.3, which lists the old citations struck through
-- alongside the current ones - see docs/mydata-integration.md.
--
-- The myDATA vatExemptionCategory code is 7 under both, so transmission is
-- unaffected. This is purely so the stored identifier stops contradicting
-- the citation printed on the receipt, which would be a nasty thing for a
-- future reader to trip over in a financial record.

alter table public.receipts
  alter column vat_category set default 'exempt_article_27';

-- No-op on a fresh database; backfills anywhere receipts were already
-- issued under the old identifier. Safe to run either way.
update public.receipts
set vat_category = 'exempt_article_27'
where vat_category = 'exempt_article_22';

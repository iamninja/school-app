-- AADE can return HTTP 200 with a MARK (i.e. what this app treats as a
-- successful filing) while the same response body also carries an
-- <errors>/<code>/<message> segment - a case this app previously never
-- looked for once a MARK was present, so it could go entirely unnoticed.
-- Surfaced on the receipt itself (not just the audit log) so the teacher
-- sees it without having to go looking.
alter table public.receipts add column mydata_warning text;

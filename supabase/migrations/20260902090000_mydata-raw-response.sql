-- AADE can return HTTP 200 while the response body itself says the
-- invoice was rejected (or, per an unresolved 2026-09-01 case, apparently
-- accept it - MARK and UID included - yet the document never surfaces in
-- AADE's own RequestTransmittedDocs or portal search). Only the parsed
-- mark/uid/error were ever kept; the raw response body was discarded on
-- every successful call, so a "phantom success" like that one cannot be
-- re-examined after the fact. Store it going forward, for every attempt.
alter table public.mydata_submission_log add column raw_response text;

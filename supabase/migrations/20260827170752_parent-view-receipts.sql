-- Parents get read-only access to their own family's receipts (for the
-- tuition history "view receipt" flow) and to the business profile (needed
-- to render a receipt's header - name/ΑΦΜ/ΔΟΥ/address - same as the
-- teacher console already does via ReceiptDocument). Same
-- is_parent_of_family() helper already used for family_balance_transactions
-- (see 20260825164925_family-balance-ledger.sql) - no write policy on
-- either table, a parent can never create/edit a receipt.

create policy "Parents view own family receipts" on public.receipts
  for select
  using (public.is_parent_of_family(family_id));

-- receipt_line_items has no family_id of its own, so this joins through
-- receipts - same shape as other child tables scoped through a parent
-- table elsewhere (e.g. quiz_question_options through quiz_questions).
create policy "Parents view own family receipt line items"
  on public.receipt_line_items
  for select
  using (
    exists (
      select 1 from public.receipts r
      where r.id = receipt_line_items.receipt_id
        and public.is_parent_of_family(r.family_id)
    )
  );

-- business_profile is a non-secret singleton (name/ΑΦΜ/ΔΟΥ/address) already
-- printed on every receipt - safe for any logged-in parent or student to
-- read, no per-family scoping needed. Real secrets (AADE credentials) live
-- in private.integration_credentials, never here.
create policy "Authenticated users view business profile"
  on public.business_profile
  for select
  to authenticated
  using (true);

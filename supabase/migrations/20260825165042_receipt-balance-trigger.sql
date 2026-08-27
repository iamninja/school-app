-- Wires issuing a receipt into the family balance ledger, as a DB
-- trigger rather than a change to createReceiptAction. A receipt insert
-- and a ledger insert are two separate HTTP round trips over PostgREST
-- (supabase-js has no transaction primitive) - if the server action did
-- both, a failure between them either falsely tells the teacher the
-- receipt failed (risking a re-issue that burns another legally
-- -significant receipt number) or silently leaves the balance wrong.
-- A trigger makes the two atomic by construction, and covers every
-- present and future code path that inserts/updates a receipt, not just
-- the one action that exists today.
--
-- receipt_id references receipts(id) on delete cascade (see the ledger
-- migration), so deleting a not-yet-transmitted receipt via
-- deleteReceiptAction needs NO code change at all: the credit row cascades
-- away and the balance trigger restores the balance automatically.

create or replace function public.post_receipt_balance_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing_id uuid;
begin
  select id into v_existing_id
  from public.family_balance_transactions
  where receipt_id = new.id;

  if new.family_id is not null and new.total_amount > 0 then
    if v_existing_id is null then
      insert into public.family_balance_transactions
        (family_id, type, amount, description, receipt_id, payment_method, source)
      values (
        new.family_id, 'receipt', -new.total_amount,
        'Απόδειξη ' || new.series || new.receipt_number,
        new.id, new.payment_method, 'receipt'
      );
    else
      -- Defensive: no updateReceiptAction exists today, but if one ever
      -- changes family_id/total_amount, the credit follows rather than
      -- going stale.
      update public.family_balance_transactions
        set family_id = new.family_id,
            amount = -new.total_amount,
            payment_method = new.payment_method
        where id = v_existing_id;
    end if;
  elsif v_existing_id is not null then
    -- family_id cleared or total_amount no longer positive: remove the
    -- credit: the balance trigger restores the balance.
    delete from public.family_balance_transactions where id = v_existing_id;
  end if;

  return null;
end;
$$;

create trigger receipts_post_balance_row
  after insert or update of family_id, total_amount on public.receipts
  for each row execute function public.post_receipt_balance_row();

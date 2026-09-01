-- Lets a receipt be issued (and still shown in the family's own history)
-- without posting a credit to their running tuition balance - for things
-- like an enrollment fee, a one-off material fee, or money already owed
-- before this app was in use, none of which should reduce what the family
-- owes in tuition.
alter table public.receipts
  add column counts_toward_balance boolean not null default true;

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

  if new.family_id is not null and new.total_amount > 0 and new.counts_toward_balance then
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
      -- changes family_id/total_amount/counts_toward_balance, the credit
      -- follows rather than going stale.
      update public.family_balance_transactions
        set family_id = new.family_id,
            amount = -new.total_amount,
            payment_method = new.payment_method
        where id = v_existing_id;
    end if;
  elsif v_existing_id is not null then
    -- family_id cleared, total_amount no longer positive, or
    -- counts_toward_balance flipped off: remove the credit - the balance
    -- trigger restores the balance.
    delete from public.family_balance_transactions where id = v_existing_id;
  end if;

  return null;
end;
$$;

drop trigger receipts_post_balance_row on public.receipts;
create trigger receipts_post_balance_row
  after insert or update of family_id, total_amount, counts_toward_balance on public.receipts
  for each row execute function public.post_receipt_balance_row();

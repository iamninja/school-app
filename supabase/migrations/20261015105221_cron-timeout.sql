-- Wait up to 55 s (was 30 s) for /api/cron/notifications to answer, so a
-- cold start still gets its reply logged in net._http_response instead of a
-- timeout. Vercel stops the function at 60 s (maxDuration), so 55 s is the
-- longest useful wait. Same function as the attendance-alerts migration
-- otherwise; the schedules don't change.

create or replace function private.call_frequent_notifications()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  base_url text;
  secret   text;
begin
  select decrypted_secret into base_url
    from vault.decrypted_secrets where name = 'app_base_url';
  select decrypted_secret into secret
    from vault.decrypted_secrets where name = 'cron_secret';

  if base_url is null or secret is null or base_url = '' or secret = '' then
    return;
  end if;

  perform net.http_get(
    url := rtrim(base_url, '/') || '/api/cron/notifications',
    headers := jsonb_build_object('Authorization', 'Bearer ' || secret),
    timeout_milliseconds := 55000
  );
end;
$$;

revoke all on function private.call_frequent_notifications() from public;

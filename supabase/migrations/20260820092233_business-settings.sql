-- Business identity + external-integration config, for issuing legally
-- valid receipts and talking to AADE myDATA (later Viva Wallet, Piraeus).
--
-- Deliberately NOT scoped per-teacher: there is exactly one business,
-- regardless of how many teacher accounts ever exist. These tables have no
-- teacher_id column at all and gate on is_teacher() membership instead.

-- Non-secret business identity. Every field here gets printed on receipts.
create table public.business_profile (
  id integer primary key default 1,
  business_name text,
  afm text,
  doy text,
  activity_code text,
  address text,
  city text,
  postal_code text,
  phone text,
  updated_at timestamptz not null default now(),
  constraint business_profile_singleton check (id = 1)
);

alter table public.business_profile enable row level security;

create policy "Teachers manage business profile" on public.business_profile
  using (public.is_teacher())
  with check (public.is_teacher());

-- Non-secret per-provider config. The active environment lives here, and
-- is the ONLY source of truth for it - credential lookups derive it from
-- this row rather than accepting it as a caller-supplied argument.
create table public.integration_settings (
  provider text primary key,
  active_environment text not null default 'sandbox'
    check (active_environment in ('sandbox', 'production')),
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.integration_settings enable row level security;

create policy "Teachers manage integration settings" on public.integration_settings
  using (public.is_teacher())
  with check (public.is_teacher());

insert into public.integration_settings (provider) values ('aade_mydata')
on conflict (provider) do nothing;

-- Encrypted API credentials.
--
-- This schema is deliberately NOT in the PostgREST exposed-schema list
-- (supabase/config.toml [api] schemas), so the REST API cannot route to it
-- at all. That matters because this same Supabase project issues
-- authenticated JWTs to students and parents - a table in `public` would
-- have only its RLS policy standing between a parent's session and the
-- tax-authority credentials, forever, across every future migration.
-- Putting it here makes that true by construction rather than by policy.
create schema if not exists private;

revoke all on schema private from anon, authenticated;

-- service_role is the ONLY role that gets in, and it needs an explicit
-- grant: a fresh schema grants nothing by default, and service_role's
-- BYPASSRLS attribute governs policies, not table privileges.
grant usage on schema private to service_role;

create table private.integration_credentials (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  credential_key text not null,
  environment text not null
    check (environment in ('sandbox', 'production')),
  -- AES-256-GCM, 'v1:<iv>:<authTag>:<ciphertext>', all base64. Encrypted
  -- in the app (lib/secrets.ts) with a key held in Vercel env, NOT in
  -- Postgres - so a Supabase-only compromise (backup, PITR restore, db
  -- dump, accidental grant) doesn't yield usable credentials.
  encrypted_value text not null,
  -- Non-secret, for the UI to show "ending in ...1234" without ever
  -- re-displaying the real value.
  last_four text,
  updated_at timestamptz not null default now(),
  last_used_at timestamptz,
  -- One row per environment, never overwritten in place: rotating the
  -- production key must not destroy the sandbox key you'll want again the
  -- next time something breaks.
  unique (provider, credential_key, environment)
);

-- Belt and suspenders on top of the schema isolation above: even if this
-- table were somehow exposed later, anon/authenticated have no grants and
-- there are no policies, so RLS denies by default.
revoke all on private.integration_credentials from anon, authenticated;
grant select, insert, update, delete on private.integration_credentials to service_role;
alter table private.integration_credentials enable row level security;

-- PostgREST refuses to route to any schema outside [api] schemas at all
-- (PGRST106), including for service_role - which is exactly the isolation
-- we want, but it also means the app can't query this table directly.
-- These SECURITY DEFINER functions in `public` are the only way in, and
-- EXECUTE is granted solely to service_role: anon/authenticated can
-- neither reach the table nor call the functions that can.

-- Status only. Deliberately never returns encrypted_value, so the common
-- read path can't leak ciphertext even if misused.
create or replace function public.get_integration_credential_status(
  p_provider text,
  p_credential_key text,
  p_environment text
)
returns table (last_four text, updated_at timestamptz, last_used_at timestamptz)
language sql
security definer
set search_path = private, public
stable
as $$
  select c.last_four, c.updated_at, c.last_used_at
  from private.integration_credentials c
  where c.provider = p_provider
    and c.credential_key = p_credential_key
    and c.environment = p_environment;
$$;

create or replace function public.get_integration_credential_secret(
  p_provider text,
  p_credential_key text,
  p_environment text
)
returns text
language sql
security definer
set search_path = private, public
volatile
as $$
  update private.integration_credentials
  set last_used_at = now()
  where provider = p_provider
    and credential_key = p_credential_key
    and environment = p_environment
  returning encrypted_value;
$$;

create or replace function public.set_integration_credential(
  p_provider text,
  p_credential_key text,
  p_environment text,
  p_encrypted_value text,
  p_last_four text
)
returns void
language sql
security definer
set search_path = private, public
volatile
as $$
  insert into private.integration_credentials
    (provider, credential_key, environment, encrypted_value, last_four, updated_at)
  values
    (p_provider, p_credential_key, p_environment, p_encrypted_value, p_last_four, now())
  on conflict (provider, credential_key, environment) do update
    set encrypted_value = excluded.encrypted_value,
        last_four = excluded.last_four,
        updated_at = now();
$$;

create or replace function public.delete_integration_credential(
  p_provider text,
  p_credential_key text,
  p_environment text
)
returns void
language sql
security definer
set search_path = private, public
volatile
as $$
  delete from private.integration_credentials
  where provider = p_provider
    and credential_key = p_credential_key
    and environment = p_environment;
$$;

revoke all on function public.get_integration_credential_status(text, text, text) from public, anon, authenticated;
revoke all on function public.get_integration_credential_secret(text, text, text) from public, anon, authenticated;
revoke all on function public.set_integration_credential(text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.delete_integration_credential(text, text, text) from public, anon, authenticated;

grant execute on function public.get_integration_credential_status(text, text, text) to service_role;
grant execute on function public.get_integration_credential_secret(text, text, text) to service_role;
grant execute on function public.set_integration_credential(text, text, text, text, text) to service_role;
grant execute on function public.delete_integration_credential(text, text, text) to service_role;

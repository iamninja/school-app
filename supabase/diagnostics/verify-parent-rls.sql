-- Check if RLS is enabled on family_parents table
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename = 'family_parents';

-- List all policies on family_parents table
select *
from pg_policies
where schemaname = 'public'
  and tablename = 'family_parents';

-- Enable RLS if not already enabled
alter table public.family_parents enable row level security;

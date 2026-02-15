-- Check if RLS is enabled on student_parents table
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename = 'student_parents';

-- List all policies on student_parents table
select *
from pg_policies
where schemaname = 'public'
  and tablename = 'student_parents';

-- Enable RLS if not already enabled
alter table public.student_parents enable row level security;

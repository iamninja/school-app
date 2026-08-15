-- Confirm quizzes.class_id is gone
select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'quizzes'
  and column_name = 'class_id';
-- Expect: 0 rows

-- Confirm quiz_assignments exists with RLS enabled
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename = 'quiz_assignments';
-- Expect: rowsecurity = true

-- List policies on the affected tables
select tablename, policyname
from pg_policies
where schemaname = 'public'
  and tablename in ('quizzes', 'quiz_questions', 'quiz_question_options', 'quiz_assignments')
order by tablename, policyname;
-- Expect quiz_assignments: "Teachers manage quiz assignments",
--   "Students view own class quiz assignments",
--   "Parents view child class quiz assignments"
-- Expect quizzes: "Teachers manage quizzes", "Students view assigned quizzes",
--   "Parents view child quizzes"

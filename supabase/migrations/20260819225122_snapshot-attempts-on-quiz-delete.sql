-- Deleting a quiz should never destroy a student's already-recorded result.
-- quiz_attempts previously cascade-deleted with its quiz, so quiz_title and
-- max_score are snapshotted at submission time and the FK becomes SET NULL
-- instead of CASCADE - the attempt row (and the student's history of it)
-- survives the quiz being deleted, even though the questions/options/answer
-- detail (which do still cascade, via quiz_questions) do not.

alter table public.quiz_attempts
  add column quiz_title text,
  add column max_score numeric(10, 2);

update public.quiz_attempts qa
set
  quiz_title = q.title,
  max_score = coalesce(
    (select sum(qq.points) from public.quiz_questions qq where qq.quiz_id = q.id),
    0
  )
from public.quizzes q
where q.id = qa.quiz_id;

alter table public.quiz_attempts
  alter column quiz_title set not null,
  alter column max_score set not null;

alter table public.quiz_attempts
  drop constraint quiz_attempts_quiz_id_fkey;

alter table public.quiz_attempts
  alter column quiz_id drop not null;

alter table public.quiz_attempts
  add constraint quiz_attempts_quiz_id_fkey
  foreign key (quiz_id) references public.quizzes(id) on delete set null;

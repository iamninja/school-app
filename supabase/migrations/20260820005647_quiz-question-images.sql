-- Storage bucket + column for optional images on quiz questions (question
-- text only, not answer options - deliberate scope decision to keep the
-- RLS/UI surface small for what's the rare case). Private bucket: quiz
-- content is only for the owning teacher and assigned students/parents,
-- matching the RLS-everywhere posture the rest of this schema already has.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'quiz-images',
  'quiz-images',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do nothing;

alter table public.quiz_questions add column image_path text;

-- Teachers own objects under a path prefixed with their own auth.uid() -
-- covers upload, the pre-save preview (before any quiz_questions row
-- references the path yet), and later re-editing. No dependency on any DB
-- row existing, unlike the broader policy below.
create policy "Teachers manage own quiz image uploads"
on storage.objects for all
using (
  bucket_id = 'quiz-images'
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.is_teacher()
)
with check (
  bucket_id = 'quiz-images'
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.is_teacher()
);

-- Once a question row actually references an uploaded image, assigned
-- students/parents (and the owning teacher, redundantly with the policy
-- above) can read it too - same non-recursive SECURITY DEFINER pattern as
-- is_quiz_assigned_to_student/is_quiz_assigned_to_parent.
create or replace function public.is_quiz_image_visible(object_name text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.quiz_questions qq
    join public.quizzes qz on qz.id = qq.quiz_id
    where qq.image_path = object_name
      and (
        qz.teacher_id = auth.uid()
        or public.is_quiz_assigned_to_student(qz.id)
        or public.is_quiz_assigned_to_parent(qz.id)
      )
  );
$$;

revoke all on function public.is_quiz_image_visible(text) from public;
grant execute on function public.is_quiz_image_visible(text) to authenticated;

create policy "Assigned students and parents view quiz images"
on storage.objects for select
using (
  bucket_id = 'quiz-images'
  and public.is_quiz_image_visible(name)
);

-- Class files: PDFs (or links, e.g. to Google Drive) the teacher posts to a
-- class, for its students and their parents. Optionally attached to one
-- homework item of the same class (the portals then show the file with
-- that homework instead of in the class's file list).
--
-- Whole class only for now (TODO.md: pick students). Uploaded files live
-- in the private class-files bucket under <teacher id>/<class id>/; the
-- portals download through /api/class-files/<id>, which hands out a
-- short-lived signed URL, so a forwarded link needs a login.
--
-- class_id cascades like homework: files are class material, not history.
-- The storage objects of a deleted class are removed by deleteClassAction
-- (Supabase blocks deleting storage objects from SQL).

create table public.class_files (
  id           uuid primary key default gen_random_uuid(),
  teacher_id   uuid not null references auth.users (id) on delete cascade,
  class_id     uuid not null references public.classes (id) on delete cascade,
  homework_id  uuid references public.homework (id) on delete set null,

  kind         text not null check (kind in ('file', 'link')),
  title        text not null check (length(trim(title)) between 1 and 200),
  note         text check (note is null or length(note) <= 1000),

  -- kind = 'file'
  storage_path text unique,
  file_name    text,
  size_bytes   integer check (size_bytes is null or size_bytes > 0),
  -- kind = 'link'
  url          text check (url is null or url ~ '^https?://'),

  pinned       boolean not null default false,
  created_at   timestamptz not null default now(),

  constraint class_files_kind_shape check (
    (kind = 'file' and storage_path is not null and file_name is not null and url is null)
    or (kind = 'link' and url is not null and storage_path is null and file_name is null and size_bytes is null)
  )
);

alter table public.class_files enable row level security;

create policy "Teachers manage class files" on public.class_files
  using ((teacher_id = auth.uid()) and public.is_teacher())
  with check ((teacher_id = auth.uid()) and public.is_teacher());

create policy "Parents view child class files" on public.class_files
  for select using (public.is_parent_of_class(class_id));

create policy "Students view own class files" on public.class_files
  for select using (public.is_student_of_class(class_id));

create index class_files_class_idx on public.class_files (class_id, created_at desc);
create index class_files_homework_idx on public.class_files (homework_id) where homework_id is not null;

-- Storage: private, PDFs up to 20 MB (raise file_size_limit here and
-- MAX_CLASS_FILE_BYTES in lib/class-files.ts together).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('class-files', 'class-files', false, 20971520, array['application/pdf'])
on conflict (id) do nothing;

-- The teacher uploads, reads and deletes under their own folder - also
-- before any class_files row points at the object (upload, then save).
create policy "Teachers manage own class file uploads"
on storage.objects for all
using (
  bucket_id = 'class-files'
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.is_teacher()
)
with check (
  bucket_id = 'class-files'
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.is_teacher()
);

-- Students and parents read an object only once a class_files row of
-- their class points at it. SECURITY DEFINER like is_quiz_image_visible.
create or replace function public.is_class_file_visible(object_name text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.class_files cf
    where cf.storage_path = object_name
      and (
        cf.teacher_id = auth.uid()
        or public.is_student_of_class(cf.class_id)
        or public.is_parent_of_class(cf.class_id)
      )
  );
$$;

revoke all on function public.is_class_file_visible(text) from public;
grant execute on function public.is_class_file_visible(text) to authenticated;

create policy "Class students and parents view class files"
on storage.objects for select
using (
  bucket_id = 'class-files'
  and public.is_class_file_visible(name)
);

-- "New file" notice: its own App tab switch and editable text. Keep the
-- event list in sync with EDITABLE_EVENTS in lib/push/messages.ts
-- (tests/push-messages.test.ts checks it).
alter table public.notification_settings
  add column class_files boolean not null default true;

alter table public.notification_templates
  drop constraint notification_templates_event_check;

alter table public.notification_templates
  add constraint notification_templates_event_check check (event in (
    'homework', 'homework_reminder', 'class_file', 'quiz', 'quiz_reminder',
    'assessment', 'assessment_moved', 'assessment_reminder',
    'lesson_cancelled', 'lesson_moved', 'lesson_extra', 'lesson_restored',
    'lessons_closed', 'lessons_reopened',
    'mark_entered', 'quiz_graded', 'absence_student', 'absence_parent',
    'receipt', 'monthly_charge', 'balance_reminder',
    'teacher_quiz_review', 'teacher_charge_failed', 'teacher_mydata_failed',
    'teacher_attendance_missing', 'teacher_attendance_summary'
  ));

-- Practice: a question bank students (and, for public sections, guests)
-- play in random rounds of 10 at /practice. Phase 1 is the bank itself:
-- the teacher's sections and questions. Rounds are drawn by the server
-- with the service role (phase 2), so there are no student/anon read
-- policies here on purpose - nobody but the teacher reads these tables
-- directly.
--
-- grade -> section (the teacher's ordered list per grade) -> question.
-- Question text, options and answers may hold {{name}} placeholders filled
-- from `variables` (lib/practice-template.ts), so one template question
-- plays as many different questions.

create table public.practice_sections (
  id          uuid primary key default gen_random_uuid(),
  teacher_id  uuid not null references auth.users (id) on delete cascade,
  grade       text not null check (grade in (
    'gym_a', 'gym_b', 'gym_c', 'lyk_a', 'lyk_b', 'lyk_c',
    'epal_a', 'epal_b', 'epal_c', 'lyk_grad', 'epal_grad'
  )),
  name        text not null check (length(trim(name)) between 1 and 120),
  position    integer not null default 0,
  -- Private until the teacher switches it on: guests only ever see public
  -- sections, students of the centre see all of them.
  is_public   boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (teacher_id, grade, name)
);

alter table public.practice_sections enable row level security;

create policy "Teachers manage practice sections" on public.practice_sections
  using ((teacher_id = auth.uid()) and public.is_teacher())
  with check ((teacher_id = auth.uid()) and public.is_teacher());

create index practice_sections_grade_idx on public.practice_sections (teacher_id, grade, position);

create table public.practice_questions (
  id           uuid primary key default gen_random_uuid(),
  teacher_id   uuid not null references auth.users (id) on delete cascade,
  section_id   uuid not null references public.practice_sections (id) on delete cascade,

  -- choice: options, exactly one correct; true_false: answer 'true'/'false';
  -- number: answer (number or expression), tolerance; slider: answer,
  -- tolerance and slider_min/max/step; point: answer '(x, y)', tolerance
  -- and graph window/plots.
  type         text not null check (type in ('choice', 'true_false', 'number', 'slider', 'point')),
  prompt       text not null check (length(trim(prompt)) between 1 and 4000),
  options      jsonb,
  answer       text,
  tolerance    numeric check (tolerance is null or tolerance >= 0),
  slider_min   numeric,
  slider_max   numeric,
  slider_step  numeric check (slider_step is null or slider_step > 0),
  graph        jsonb,
  -- Random-number template: "a=2..9, x=-10..10, c=a*x+b" and an optional
  -- condition every draw must meet ("a != 0").
  variables    text check (variables is null or length(variables) <= 1000),
  condition    text check (condition is null or length(condition) <= 500),
  explanation  text check (explanation is null or length(explanation) <= 4000),
  -- Public practice-images bucket (teaching material, also shown to guests).
  image_path   text,

  source       text not null default 'manual' check (source in ('manual', 'quiz', 'import')),
  -- The quiz question it was copied from, so a second copy can be spotted.
  source_quiz_question_id uuid,
  position     integer not null default 0,
  -- Off = kept (with its stats, later) but never drawn.
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint practice_questions_shape check (
    (type = 'choice' and options is not null and jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 2 and 6)
    or (type = 'true_false' and answer in ('true', 'false'))
    or (type = 'number' and answer is not null)
    or (type = 'slider' and answer is not null and slider_min is not null and slider_max is not null and slider_max > slider_min)
    or (type = 'point' and answer is not null and graph is not null)
  )
);

alter table public.practice_questions enable row level security;

create policy "Teachers manage practice questions" on public.practice_questions
  using ((teacher_id = auth.uid()) and public.is_teacher())
  with check (
    (teacher_id = auth.uid()) and public.is_teacher()
    and exists (
      select 1 from public.practice_sections s
      where s.id = section_id and s.teacher_id = auth.uid()
    )
  );

create index practice_questions_section_idx on public.practice_questions (section_id, position);
create index practice_questions_source_idx on public.practice_questions (source_quiz_question_id)
  where source_quiz_question_id is not null;

-- Question images: public read (they are teaching material and guests see
-- public sections), the teacher writes under their own folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('practice-images', 'practice-images', true, 5242880,
        array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

create policy "Teachers manage own practice images"
on storage.objects for all
using (
  bucket_id = 'practice-images'
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.is_teacher()
)
with check (
  bucket_id = 'practice-images'
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.is_teacher()
);

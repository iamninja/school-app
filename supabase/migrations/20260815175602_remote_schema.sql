-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

DROP EXTENSION pg_net;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT DELETE, INSERT, SELECT, UPDATE ON TABLES TO anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, USAGE ON SEQUENCES TO anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON ROUTINES TO anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT DELETE, INSERT, SELECT, UPDATE ON TABLES TO authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, USAGE ON SEQUENCES TO authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON ROUTINES TO authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT DELETE, INSERT, SELECT, UPDATE ON TABLES TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, USAGE ON SEQUENCES TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON ROUTINES TO service_role;

CREATE FUNCTION public.is_parent_of_class (
  class_id_param uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select exists (
    select 1
    from public.student_class_assignments sca
    join public.students s on s.id = sca.student_id
    join public.family_parents fp on fp.family_id = s.family_id
    where sca.class_id = class_id_param
      and fp.user_id = auth.uid()
  );
$function$;

REVOKE ALL ON FUNCTION public.is_parent_of_class(uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION public.is_parent_of_class(uuid) TO anon;

GRANT ALL ON FUNCTION public.is_parent_of_class(uuid) TO authenticated;

GRANT ALL ON FUNCTION public.is_parent_of_class(uuid) TO service_role;

CREATE FUNCTION public.is_parent_of_family (
  family_id_param uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select exists (
    select 1
    from public.family_parents
    where family_id = family_id_param
      and user_id = auth.uid()
  );
$function$;

REVOKE ALL ON FUNCTION public.is_parent_of_family(uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION public.is_parent_of_family(uuid) TO anon;

GRANT ALL ON FUNCTION public.is_parent_of_family(uuid) TO authenticated;

GRANT ALL ON FUNCTION public.is_parent_of_family(uuid) TO service_role;

CREATE FUNCTION public.is_parent_of_student (
  student_id_param uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select exists (
    select 1
    from public.students s
    join public.family_parents fp on fp.family_id = s.family_id
    where s.id = student_id_param
      and fp.user_id = auth.uid()
  );
$function$;

REVOKE ALL ON FUNCTION public.is_parent_of_student(uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION public.is_parent_of_student(uuid) TO anon;

GRANT ALL ON FUNCTION public.is_parent_of_student(uuid) TO authenticated;

GRANT ALL ON FUNCTION public.is_parent_of_student(uuid) TO service_role;

CREATE FUNCTION public.is_quiz_assigned_to_parent (
  quiz_id_param uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select exists (
    select 1
    from public.quiz_assignments qa
    join public.student_class_assignments sca on sca.class_id = qa.class_id
    join public.students s on s.id = sca.student_id
    join public.family_parents fp on fp.family_id = s.family_id
    where qa.quiz_id = quiz_id_param
      and fp.user_id = auth.uid()
  );
$function$;

REVOKE ALL ON FUNCTION public.is_quiz_assigned_to_parent(uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION public.is_quiz_assigned_to_parent(uuid) TO anon;

GRANT ALL ON FUNCTION public.is_quiz_assigned_to_parent(uuid) TO authenticated;

GRANT ALL ON FUNCTION public.is_quiz_assigned_to_parent(uuid) TO service_role;

CREATE FUNCTION public.is_quiz_assigned_to_student (
  quiz_id_param uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select exists (
    select 1
    from public.quiz_assignments qa
    join public.student_class_assignments sca on sca.class_id = qa.class_id
    join public.students s on s.id = sca.student_id
    where qa.quiz_id = quiz_id_param
      and s.user_id = auth.uid()
  );
$function$;

REVOKE ALL ON FUNCTION public.is_quiz_assigned_to_student(uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION public.is_quiz_assigned_to_student(uuid) TO anon;

GRANT ALL ON FUNCTION public.is_quiz_assigned_to_student(uuid) TO authenticated;

GRANT ALL ON FUNCTION public.is_quiz_assigned_to_student(uuid) TO service_role;

CREATE FUNCTION public.is_student_of_class (
  class_id_param uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select exists (
    select 1
    from public.student_class_assignments sca
    join public.students s on s.id = sca.student_id
    where sca.class_id = class_id_param
      and s.user_id = auth.uid()
  );
$function$;

REVOKE ALL ON FUNCTION public.is_student_of_class(uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION public.is_student_of_class(uuid) TO anon;

GRANT ALL ON FUNCTION public.is_student_of_class(uuid) TO authenticated;

GRANT ALL ON FUNCTION public.is_student_of_class(uuid) TO service_role;

CREATE TABLE public.attendance_records (
  id              uuid                     DEFAULT gen_random_uuid() NOT NULL,
  teacher_id      uuid                     NOT NULL,
  class_id        uuid                     NOT NULL,
  student_id      uuid                     NOT NULL,
  attendance_date date                     NOT NULL,
  status          text                     NOT NULL,
  created_at      timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.attendance_records
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.attendance_records
  ADD CONSTRAINT attendance_records_pkey PRIMARY KEY (id);

ALTER TABLE public.attendance_records
  ADD CONSTRAINT attendance_records_status_check CHECK (status = ANY (ARRAY['present'::text, 'late'::text, 'absent'::text]));

ALTER TABLE public.attendance_records
  ADD CONSTRAINT attendance_records_teacher_id_class_id_student_id_attendanc_key UNIQUE (teacher_id, class_id, student_id, attendance_date);

ALTER TABLE public.attendance_records
  ADD CONSTRAINT attendance_records_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES auth.users(id) ON DELETE CASCADE;

GRANT ALL ON public.attendance_records TO anon;

GRANT ALL ON public.attendance_records TO authenticated;

GRANT ALL ON public.attendance_records TO service_role;

CREATE POLICY "Parents view child attendance" ON public.attendance_records
  FOR SELECT
  USING (public.is_parent_of_student(student_id));

CREATE POLICY "Teachers manage attendance" ON public.attendance_records
  USING ((teacher_id = auth.uid()))
  WITH CHECK ((teacher_id = auth.uid()));

CREATE TABLE public.class_schedule_slots (
  id         uuid                     DEFAULT gen_random_uuid() NOT NULL,
  teacher_id uuid                     NOT NULL,
  class_id   uuid                     NOT NULL,
  day        text                     NOT NULL,
  "time"     text                     NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.class_schedule_slots
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.class_schedule_slots
  ADD CONSTRAINT class_schedule_slots_pkey PRIMARY KEY (id);

ALTER TABLE public.class_schedule_slots
  ADD CONSTRAINT class_schedule_slots_teacher_id_day_time_key UNIQUE (teacher_id, day, "time");

ALTER TABLE public.class_schedule_slots
  ADD CONSTRAINT class_schedule_slots_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES auth.users(id) ON DELETE CASCADE;

GRANT ALL ON public.class_schedule_slots TO anon;

GRANT ALL ON public.class_schedule_slots TO authenticated;

GRANT ALL ON public.class_schedule_slots TO service_role;

CREATE POLICY "Parents view child class schedules" ON public.class_schedule_slots
  FOR SELECT
  USING (public.is_parent_of_class(class_id));

CREATE POLICY "Teachers manage schedules" ON public.class_schedule_slots
  USING ((teacher_id = auth.uid()))
  WITH CHECK ((teacher_id = auth.uid()));

CREATE TABLE public.classes (
  id             uuid                     DEFAULT gen_random_uuid() NOT NULL,
  teacher_id     uuid                     NOT NULL,
  name           text                     NOT NULL,
  hours_per_week integer                  NOT NULL,
  created_at     timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.classes
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.classes
  ADD CONSTRAINT classes_hours_per_week_check CHECK (hours_per_week > 0);

ALTER TABLE public.classes
  ADD CONSTRAINT classes_pkey PRIMARY KEY (id);

ALTER TABLE public.attendance_records
  ADD CONSTRAINT attendance_records_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;

ALTER TABLE public.class_schedule_slots
  ADD CONSTRAINT class_schedule_slots_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;

ALTER TABLE public.classes
  ADD CONSTRAINT classes_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES auth.users(id) ON DELETE CASCADE;

GRANT ALL ON public.classes TO anon;

GRANT ALL ON public.classes TO authenticated;

GRANT ALL ON public.classes TO service_role;

CREATE POLICY "Parents view child classes" ON public.classes
  FOR SELECT
  USING (public.is_parent_of_class(id));

CREATE POLICY "Teachers manage classes" ON public.classes
  USING ((teacher_id = auth.uid()))
  WITH CHECK ((teacher_id = auth.uid()));

CREATE TABLE public.families (
  id         uuid                     DEFAULT gen_random_uuid() NOT NULL,
  teacher_id uuid                     NOT NULL,
  deleted_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.families
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.families
  ADD CONSTRAINT families_pkey PRIMARY KEY (id);

ALTER TABLE public.families
  ADD CONSTRAINT families_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES auth.users(id) ON DELETE CASCADE;

GRANT ALL ON public.families TO anon;

GRANT ALL ON public.families TO authenticated;

GRANT ALL ON public.families TO service_role;

CREATE POLICY "Parents view own family" ON public.families
  FOR SELECT
  USING (public.is_parent_of_family(id));

CREATE POLICY "Teachers manage families" ON public.families
  USING ((teacher_id = auth.uid()))
  WITH CHECK ((teacher_id = auth.uid()));

CREATE TABLE public.family_parents (
  id         uuid    DEFAULT gen_random_uuid() NOT NULL,
  name       text,
  email      text,
  phone      text,
  is_primary boolean DEFAULT false NOT NULL,
  user_id    uuid,
  family_id  uuid    NOT NULL
);

ALTER TABLE public.family_parents
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.family_parents
  ADD CONSTRAINT family_parents_family_id_fkey FOREIGN KEY (family_id) REFERENCES public.families(id) ON DELETE CASCADE;

ALTER TABLE public.family_parents
  ADD CONSTRAINT student_parents_pkey PRIMARY KEY (id);

ALTER TABLE public.family_parents
  ADD CONSTRAINT student_parents_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

GRANT ALL ON public.family_parents TO anon;

GRANT ALL ON public.family_parents TO authenticated;

GRANT ALL ON public.family_parents TO service_role;

CREATE UNIQUE INDEX family_parents_user_id_unique ON public.family_parents (user_id)
  WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX family_parents_email_unique ON public.family_parents (email)
  WHERE email IS NOT NULL;

CREATE POLICY "Parents view own data" ON public.family_parents
  FOR SELECT
  USING ((user_id = auth.uid()));

CREATE POLICY "Teachers manage parents" ON public.family_parents
  USING ((EXISTS ( SELECT 1
   FROM public.families f
  WHERE ((f.id = family_parents.family_id) AND (f.teacher_id = auth.uid())))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM public.families f
  WHERE ((f.id = family_parents.family_id) AND (f.teacher_id = auth.uid())))));

CREATE TABLE public.quiz_assignments (
  id          uuid                     DEFAULT gen_random_uuid() NOT NULL,
  quiz_id     uuid                     NOT NULL,
  class_id    uuid                     NOT NULL,
  assigned_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.quiz_assignments
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.quiz_assignments
  ADD CONSTRAINT quiz_assignments_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;

ALTER TABLE public.quiz_assignments
  ADD CONSTRAINT quiz_assignments_pkey PRIMARY KEY (id);

ALTER TABLE public.quiz_assignments
  ADD CONSTRAINT quiz_assignments_quiz_id_class_id_key UNIQUE (quiz_id, class_id);

GRANT ALL ON public.quiz_assignments TO anon;

GRANT ALL ON public.quiz_assignments TO authenticated;

GRANT ALL ON public.quiz_assignments TO service_role;

CREATE POLICY "Parents view child class quiz assignments" ON public.quiz_assignments
  FOR SELECT
  USING (public.is_parent_of_class(class_id));

CREATE POLICY "Students view own class quiz assignments" ON public.quiz_assignments
  FOR SELECT
  USING (public.is_student_of_class(class_id));

CREATE TABLE public.quiz_attempt_answers (
  id                 uuid                     DEFAULT gen_random_uuid() NOT NULL,
  attempt_id         uuid                     NOT NULL,
  question_id        uuid                     NOT NULL,
  selected_option_id uuid,
  text_answer        text,
  is_correct         boolean,
  points_awarded     numeric(10,2),
  created_at         timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.quiz_attempt_answers
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.quiz_attempt_answers
  ADD CONSTRAINT quiz_attempt_answers_pkey PRIMARY KEY (id);

GRANT ALL ON public.quiz_attempt_answers TO anon;

GRANT ALL ON public.quiz_attempt_answers TO authenticated;

GRANT ALL ON public.quiz_attempt_answers TO service_role;

CREATE TABLE public.quiz_attempt_starts (
  id         uuid                     DEFAULT gen_random_uuid() NOT NULL,
  quiz_id    uuid                     NOT NULL,
  student_id uuid                     NOT NULL,
  started_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.quiz_attempt_starts
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.quiz_attempt_starts
  ADD CONSTRAINT quiz_attempt_starts_pkey PRIMARY KEY (id);

ALTER TABLE public.quiz_attempt_starts
  ADD CONSTRAINT quiz_attempt_starts_quiz_id_student_id_key UNIQUE (quiz_id, student_id);

GRANT ALL ON public.quiz_attempt_starts TO anon;

GRANT ALL ON public.quiz_attempt_starts TO authenticated;

GRANT ALL ON public.quiz_attempt_starts TO service_role;

CREATE TABLE public.quiz_attempts (
  id           uuid                     DEFAULT gen_random_uuid() NOT NULL,
  quiz_id      uuid                     NOT NULL,
  student_id   uuid                     NOT NULL,
  submitted_at timestamp with time zone DEFAULT now() NOT NULL,
  score        numeric(10,2)            DEFAULT 0 NOT NULL
);

CREATE POLICY "Parents view child quiz attempt answers" ON public.quiz_attempt_answers
  FOR SELECT
  USING ((EXISTS ( SELECT 1
   FROM public.quiz_attempts qa
  WHERE ((qa.id = quiz_attempt_answers.attempt_id) AND public.is_parent_of_student(qa.student_id)))));

ALTER TABLE public.quiz_attempts
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.quiz_attempts
  ADD CONSTRAINT quiz_attempts_pkey PRIMARY KEY (id);

ALTER TABLE public.quiz_attempt_answers
  ADD CONSTRAINT quiz_attempt_answers_attempt_id_fkey FOREIGN KEY (attempt_id) REFERENCES public.quiz_attempts(id) ON DELETE CASCADE;

ALTER TABLE public.quiz_attempts
  ADD CONSTRAINT quiz_attempts_quiz_id_student_id_key UNIQUE (quiz_id, student_id);

GRANT ALL ON public.quiz_attempts TO anon;

GRANT ALL ON public.quiz_attempts TO authenticated;

GRANT ALL ON public.quiz_attempts TO service_role;

CREATE POLICY "Parents view child quiz attempts" ON public.quiz_attempts
  FOR SELECT
  USING (public.is_parent_of_student(student_id));

CREATE TABLE public.quiz_question_options (
  id          uuid                     DEFAULT gen_random_uuid() NOT NULL,
  question_id uuid                     NOT NULL,
  option_text text                     NOT NULL,
  is_correct  boolean                  DEFAULT false NOT NULL,
  order_index integer                  DEFAULT 0 NOT NULL,
  created_at  timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.quiz_question_options
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.quiz_question_options
  ADD CONSTRAINT quiz_question_options_pkey PRIMARY KEY (id);

ALTER TABLE public.quiz_attempt_answers
  ADD CONSTRAINT quiz_attempt_answers_selected_option_id_fkey FOREIGN KEY (selected_option_id) REFERENCES public.quiz_question_options(id) ON DELETE SET NULL;

GRANT ALL ON public.quiz_question_options TO anon;

GRANT ALL ON public.quiz_question_options TO authenticated;

GRANT ALL ON public.quiz_question_options TO service_role;

CREATE TABLE public.quiz_questions (
  id            uuid                     DEFAULT gen_random_uuid() NOT NULL,
  quiz_id       uuid                     NOT NULL,
  question_text text                     NOT NULL,
  question_type text                     NOT NULL,
  order_index   integer                  DEFAULT 0 NOT NULL,
  points        integer                  DEFAULT 1 NOT NULL,
  created_at    timestamp with time zone DEFAULT now() NOT NULL
);

CREATE POLICY "Students view assigned quiz question options" ON public.quiz_question_options
  FOR SELECT
  USING ((EXISTS ( SELECT 1
   FROM public.quiz_questions qq
  WHERE ((qq.id = quiz_question_options.question_id) AND public.is_quiz_assigned_to_student(qq.quiz_id)))));

ALTER TABLE public.quiz_questions
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.quiz_questions
  ADD CONSTRAINT quiz_questions_pkey PRIMARY KEY (id);

ALTER TABLE public.quiz_attempt_answers
  ADD CONSTRAINT quiz_attempt_answers_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.quiz_questions(id) ON DELETE CASCADE;

ALTER TABLE public.quiz_question_options
  ADD CONSTRAINT quiz_question_options_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.quiz_questions(id) ON DELETE CASCADE;

ALTER TABLE public.quiz_questions
  ADD CONSTRAINT quiz_questions_points_check CHECK (points > 0);

ALTER TABLE public.quiz_questions
  ADD CONSTRAINT quiz_questions_question_type_check CHECK (question_type = ANY (ARRAY['multiple_choice'::text, 'true_false'::text, 'short_answer'::text]));

GRANT ALL ON public.quiz_questions TO anon;

GRANT ALL ON public.quiz_questions TO authenticated;

GRANT ALL ON public.quiz_questions TO service_role;

CREATE POLICY "Students view assigned quiz questions" ON public.quiz_questions
  FOR SELECT
  USING (public.is_quiz_assigned_to_student(quiz_id));

CREATE TABLE public.quizzes (
  id                 uuid                     DEFAULT gen_random_uuid() NOT NULL,
  teacher_id         uuid                     NOT NULL,
  title              text                     NOT NULL,
  description        text,
  created_at         timestamp with time zone DEFAULT now() NOT NULL,
  time_limit_minutes integer
);

CREATE POLICY "Teachers manage quiz assignments" ON public.quiz_assignments
  USING ((EXISTS ( SELECT 1
   FROM public.quizzes q
  WHERE ((q.id = quiz_assignments.quiz_id) AND (q.teacher_id = auth.uid())))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM public.quizzes q
  WHERE ((q.id = quiz_assignments.quiz_id) AND (q.teacher_id = auth.uid())))));

CREATE POLICY "Teachers manage quiz attempt answers" ON public.quiz_attempt_answers
  USING ((EXISTS ( SELECT 1
   FROM (public.quiz_attempts qa
     JOIN public.quizzes q ON ((q.id = qa.quiz_id)))
  WHERE ((qa.id = quiz_attempt_answers.attempt_id) AND (q.teacher_id = auth.uid())))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.quiz_attempts qa
     JOIN public.quizzes q ON ((q.id = qa.quiz_id)))
  WHERE ((qa.id = quiz_attempt_answers.attempt_id) AND (q.teacher_id = auth.uid())))));

CREATE POLICY "Teachers manage quiz attempts" ON public.quiz_attempts
  USING ((EXISTS ( SELECT 1
   FROM public.quizzes q
  WHERE ((q.id = quiz_attempts.quiz_id) AND (q.teacher_id = auth.uid())))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM public.quizzes q
  WHERE ((q.id = quiz_attempts.quiz_id) AND (q.teacher_id = auth.uid())))));

CREATE POLICY "Teachers manage quiz question options" ON public.quiz_question_options
  USING ((EXISTS ( SELECT 1
   FROM (public.quiz_questions qq
     JOIN public.quizzes q ON ((q.id = qq.quiz_id)))
  WHERE ((qq.id = quiz_question_options.question_id) AND (q.teacher_id = auth.uid())))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.quiz_questions qq
     JOIN public.quizzes q ON ((q.id = qq.quiz_id)))
  WHERE ((qq.id = quiz_question_options.question_id) AND (q.teacher_id = auth.uid())))));

CREATE POLICY "Teachers manage quiz questions" ON public.quiz_questions
  USING ((EXISTS ( SELECT 1
   FROM public.quizzes q
  WHERE ((q.id = quiz_questions.quiz_id) AND (q.teacher_id = auth.uid())))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM public.quizzes q
  WHERE ((q.id = quiz_questions.quiz_id) AND (q.teacher_id = auth.uid())))));

ALTER TABLE public.quizzes
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.quizzes
  ADD CONSTRAINT quizzes_pkey PRIMARY KEY (id);

ALTER TABLE public.quiz_assignments
  ADD CONSTRAINT quiz_assignments_quiz_id_fkey FOREIGN KEY (quiz_id) REFERENCES public.quizzes(id) ON DELETE CASCADE;

ALTER TABLE public.quiz_attempt_starts
  ADD CONSTRAINT quiz_attempt_starts_quiz_id_fkey FOREIGN KEY (quiz_id) REFERENCES public.quizzes(id) ON DELETE CASCADE;

ALTER TABLE public.quiz_attempts
  ADD CONSTRAINT quiz_attempts_quiz_id_fkey FOREIGN KEY (quiz_id) REFERENCES public.quizzes(id) ON DELETE CASCADE;

ALTER TABLE public.quiz_questions
  ADD CONSTRAINT quiz_questions_quiz_id_fkey FOREIGN KEY (quiz_id) REFERENCES public.quizzes(id) ON DELETE CASCADE;

ALTER TABLE public.quizzes
  ADD CONSTRAINT quizzes_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES auth.users(id) ON DELETE CASCADE;

GRANT ALL ON public.quizzes TO anon;

GRANT ALL ON public.quizzes TO authenticated;

GRANT ALL ON public.quizzes TO service_role;

CREATE POLICY "Parents view child quizzes" ON public.quizzes
  FOR SELECT
  USING (public.is_quiz_assigned_to_parent(id));

CREATE POLICY "Students view assigned quizzes" ON public.quizzes
  FOR SELECT
  USING (public.is_quiz_assigned_to_student(id));

CREATE POLICY "Teachers manage quizzes" ON public.quizzes
  USING ((teacher_id = auth.uid()))
  WITH CHECK ((teacher_id = auth.uid()));

CREATE TABLE public.student_class_assignments (
  id         uuid DEFAULT gen_random_uuid() NOT NULL,
  student_id uuid NOT NULL,
  class_id   uuid NOT NULL
);

ALTER TABLE public.student_class_assignments
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.student_class_assignments
  ADD CONSTRAINT student_class_assignments_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;

ALTER TABLE public.student_class_assignments
  ADD CONSTRAINT student_class_assignments_pkey PRIMARY KEY (id);

ALTER TABLE public.student_class_assignments
  ADD CONSTRAINT student_class_assignments_student_id_class_id_key UNIQUE (student_id, class_id);

GRANT ALL ON public.student_class_assignments TO anon;

GRANT ALL ON public.student_class_assignments TO authenticated;

GRANT ALL ON public.student_class_assignments TO service_role;

CREATE POLICY "Parents view child class assignments" ON public.student_class_assignments
  FOR SELECT
  USING (public.is_parent_of_student(student_id));

CREATE TABLE public.students (
  id             uuid                     DEFAULT gen_random_uuid() NOT NULL,
  teacher_id     uuid                     NOT NULL,
  first_name     text                     NOT NULL,
  last_name      text                     NOT NULL,
  grade_level    text,
  email          text,
  tuition_amount numeric(10,2),
  tuition_status text                     DEFAULT 'current'::text NOT NULL,
  created_at     timestamp with time zone DEFAULT now() NOT NULL,
  user_id        uuid,
  family_id      uuid                     NOT NULL,
  withdrawn_at   timestamp with time zone
);

CREATE POLICY "Students view own attendance" ON public.attendance_records
  FOR SELECT
  USING ((EXISTS ( SELECT 1
   FROM public.students s
  WHERE ((s.id = attendance_records.student_id) AND (s.user_id = auth.uid())))));

CREATE POLICY "Students view assigned class schedules" ON public.class_schedule_slots
  FOR SELECT
  USING ((EXISTS ( SELECT 1
   FROM (public.student_class_assignments sca
     JOIN public.students s ON ((s.id = sca.student_id)))
  WHERE ((sca.class_id = class_schedule_slots.class_id) AND (s.user_id = auth.uid())))));

CREATE POLICY "Students view assigned classes" ON public.classes
  FOR SELECT
  USING ((EXISTS ( SELECT 1
   FROM (public.student_class_assignments sca
     JOIN public.students s ON ((s.id = sca.student_id)))
  WHERE ((sca.class_id = classes.id) AND (s.user_id = auth.uid())))));

CREATE POLICY "Students view own parent info" ON public.family_parents
  FOR SELECT
  USING ((EXISTS ( SELECT 1
   FROM public.students s
  WHERE ((s.family_id = family_parents.family_id) AND (s.user_id = auth.uid())))));

CREATE POLICY "Students create own quiz attempt answers" ON public.quiz_attempt_answers
  FOR INSERT
  WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.quiz_attempts qa
     JOIN public.students s ON ((s.id = qa.student_id)))
  WHERE ((qa.id = quiz_attempt_answers.attempt_id) AND (s.user_id = auth.uid())))));

CREATE POLICY "Students view own quiz attempt answers" ON public.quiz_attempt_answers
  FOR SELECT
  USING ((EXISTS ( SELECT 1
   FROM (public.quiz_attempts qa
     JOIN public.students s ON ((s.id = qa.student_id)))
  WHERE ((qa.id = quiz_attempt_answers.attempt_id) AND (s.user_id = auth.uid())))));

CREATE POLICY "Students manage own quiz attempt starts" ON public.quiz_attempt_starts
  USING ((EXISTS ( SELECT 1
   FROM public.students s
  WHERE ((s.id = quiz_attempt_starts.student_id) AND (s.user_id = auth.uid())))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM public.students s
  WHERE ((s.id = quiz_attempt_starts.student_id) AND (s.user_id = auth.uid())))));

CREATE POLICY "Students create own quiz attempts" ON public.quiz_attempts
  FOR INSERT
  WITH CHECK ((EXISTS ( SELECT 1
   FROM public.students s
  WHERE ((s.id = quiz_attempts.student_id) AND (s.user_id = auth.uid())))));

CREATE POLICY "Students view own quiz attempts" ON public.quiz_attempts
  FOR SELECT
  USING ((EXISTS ( SELECT 1
   FROM public.students s
  WHERE ((s.id = quiz_attempts.student_id) AND (s.user_id = auth.uid())))));

CREATE POLICY "Students view own class assignments" ON public.student_class_assignments
  FOR SELECT
  USING ((EXISTS ( SELECT 1
   FROM public.students s
  WHERE ((s.id = student_class_assignments.student_id) AND (s.user_id = auth.uid())))));

CREATE POLICY "Teachers manage student classes" ON public.student_class_assignments
  USING ((EXISTS ( SELECT 1
   FROM public.students s
  WHERE ((s.id = student_class_assignments.student_id) AND (s.teacher_id = auth.uid())))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM public.students s
  WHERE ((s.id = student_class_assignments.student_id) AND (s.teacher_id = auth.uid())))));

ALTER TABLE public.students
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.students
  ADD CONSTRAINT students_family_id_fkey FOREIGN KEY (family_id) REFERENCES public.families(id) ON DELETE RESTRICT;

ALTER TABLE public.students
  ADD CONSTRAINT students_pkey PRIMARY KEY (id);

ALTER TABLE public.attendance_records
  ADD CONSTRAINT attendance_records_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;

ALTER TABLE public.quiz_attempt_starts
  ADD CONSTRAINT quiz_attempt_starts_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;

ALTER TABLE public.quiz_attempts
  ADD CONSTRAINT quiz_attempts_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;

ALTER TABLE public.student_class_assignments
  ADD CONSTRAINT student_class_assignments_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;

ALTER TABLE public.students
  ADD CONSTRAINT students_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.students
  ADD CONSTRAINT students_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

GRANT ALL ON public.students TO anon;

GRANT ALL ON public.students TO authenticated;

GRANT ALL ON public.students TO service_role;

CREATE UNIQUE INDEX students_email_unique ON public.students (email)
  WHERE email IS NOT NULL;

CREATE UNIQUE INDEX students_user_id_unique ON public.students (user_id)
  WHERE user_id IS NOT NULL;

CREATE POLICY "Parents view child data" ON public.students
  FOR SELECT
  USING (public.is_parent_of_student(id));

CREATE POLICY "Students view own data" ON public.students
  FOR SELECT
  USING ((user_id = auth.uid()));

CREATE POLICY "Teachers manage students" ON public.students
  USING ((teacher_id = auth.uid()))
  WITH CHECK ((teacher_id = auth.uid()));

CREATE TABLE public.teachers (
  user_id uuid NOT NULL
);

ALTER TABLE public.teachers
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.teachers
  ADD CONSTRAINT teachers_pkey PRIMARY KEY (user_id);

ALTER TABLE public.teachers
  ADD CONSTRAINT teachers_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

GRANT ALL ON public.teachers TO anon;

GRANT ALL ON public.teachers TO authenticated;

GRANT ALL ON public.teachers TO service_role;

CREATE POLICY "Users can check their own teacher membership" ON public.teachers
  FOR SELECT
  USING ((user_id = auth.uid()));

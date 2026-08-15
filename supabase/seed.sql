-- Seeds a working local dev teacher (dev-teacher@example.test /
-- local-dev-password) plus sample classes/students/families - works out
-- of the box against a fresh `supabase start`/`db reset`, no manual setup
-- needed. If you'd rather seed against your own real account instead,
-- replace the UUID below with your auth.users.id (select id, email from
-- auth.users) - the bootstrap step is gated to only fire for the default
-- placeholder, so a real account's UUID here is left untouched.

do $$
declare
  v_teacher_id uuid := '8ba10a07-5dfe-45c5-b07e-c6b9e462011a';
  class_math uuid;
  class_science uuid;
  class_history uuid;
  class_english uuid;
  class_coding uuid;
  student_olivia uuid;
  student_jayden uuid;
  student_noah uuid;
  student_lina uuid;
  student_mateo uuid;
  family_olivia uuid;
  family_jayden uuid;
  family_noah uuid;
  family_lina uuid;
  family_mateo uuid;
begin
  -- Bootstrap the default placeholder teacher's auth.users/auth.identities
  -- rows (needed for the FK on students.teacher_id/etc. to resolve, and
  -- for the auth.identities row to actually be able to log in) plus a
  -- public.teachers row so requireTeacher() passes. Only fires for the
  -- unmodified default UUID - if you've replaced it with your own real
  -- account's id, this whole block is a no-op and your account is left
  -- alone.
  if v_teacher_id = '8ba10a07-5dfe-45c5-b07e-c6b9e462011a'::uuid then
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, email_change,
      email_change_token_new, recovery_token
    ) values (
      '00000000-0000-0000-0000-000000000000', v_teacher_id, 'authenticated', 'authenticated',
      'dev-teacher@example.test', extensions.crypt('local-dev-password', extensions.gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
    ) on conflict (id) do nothing;

    insert into auth.identities (
      id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), v_teacher_id, v_teacher_id::text,
      format('{"sub":"%s","email":"%s"}', v_teacher_id::text, 'dev-teacher@example.test')::jsonb,
      'email', now(), now(), now()
    ) on conflict do nothing;

    insert into public.teachers (user_id) values (v_teacher_id) on conflict (user_id) do nothing;
  end if;

  insert into public.classes (teacher_id, name, hours_per_week)
  values
    (v_teacher_id, 'Math 101', 3),
    (v_teacher_id, 'Science Lab', 2),
    (v_teacher_id, 'World History', 2),
    (v_teacher_id, 'English Literature', 3),
    (v_teacher_id, 'Intro to Coding', 2);

  -- Manually re-query for class IDs to avoid relying on insert order.
  select id into class_math from public.classes where teacher_id = v_teacher_id and name = 'Math 101' limit 1;
  select id into class_science from public.classes where teacher_id = v_teacher_id and name = 'Science Lab' limit 1;
  select id into class_history from public.classes where teacher_id = v_teacher_id and name = 'World History' limit 1;
  select id into class_english from public.classes where teacher_id = v_teacher_id and name = 'English Literature' limit 1;
  select id into class_coding from public.classes where teacher_id = v_teacher_id and name = 'Intro to Coding' limit 1;

  -- Schedule slots (Mon-Fri, 15:00-23:00). Keep it sparse.
  insert into public.class_schedule_slots (teacher_id, class_id, day, time)
  values
    (v_teacher_id, class_math, 'Mon', '15:00'),
    (v_teacher_id, class_science, 'Mon', '17:00'),
    (v_teacher_id, class_history, 'Tue', '16:00'),
    (v_teacher_id, class_english, 'Wed', '15:00'),
    (v_teacher_id, class_coding, 'Thu', '18:00'),
    (v_teacher_id, class_math, 'Fri', '20:00')
  on conflict (teacher_id, day, time) do update
  set class_id = excluded.class_id;

  -- One family per seeded student (none of these are siblings) - created
  -- before students since students.family_id is not null.
  insert into public.families (teacher_id) values (v_teacher_id) returning id into family_olivia;
  insert into public.families (teacher_id) values (v_teacher_id) returning id into family_jayden;
  insert into public.families (teacher_id) values (v_teacher_id) returning id into family_noah;
  insert into public.families (teacher_id) values (v_teacher_id) returning id into family_lina;
  insert into public.families (teacher_id) values (v_teacher_id) returning id into family_mateo;

  insert into public.students (
    teacher_id,
    family_id,
    first_name,
    last_name,
    grade_level,
    email,
    tuition_amount,
    tuition_status
  )
  values
    (v_teacher_id, family_olivia, 'Olivia', 'Nguyen', '9', 'olivia.nguyen@example.com', 420, 'current'),
    (v_teacher_id, family_jayden, 'Jayden', 'Cole', '10', 'jayden.cole@example.com', 380, 'past-due'),
    (v_teacher_id, family_noah, 'Noah', 'Kim', '11', 'noah.kim@example.com', 460, 'current'),
    (v_teacher_id, family_lina, 'Lina', 'Patel', '8', 'lina.patel@example.com', 400, 'scholarship'),
    (v_teacher_id, family_mateo, 'Mateo', 'Santos', '12', 'mateo.santos@example.com', 500, 'current');

  -- Re-query student IDs to avoid relying on insert order.
  select id into student_olivia from public.students where teacher_id = v_teacher_id and first_name = 'Olivia' limit 1;
  select id into student_jayden from public.students where teacher_id = v_teacher_id and first_name = 'Jayden' limit 1;
  select id into student_noah from public.students where teacher_id = v_teacher_id and first_name = 'Noah' limit 1;
  select id into student_lina from public.students where teacher_id = v_teacher_id and first_name = 'Lina' limit 1;
  select id into student_mateo from public.students where teacher_id = v_teacher_id and first_name = 'Mateo' limit 1;

  insert into public.family_parents (family_id, name, email, phone, is_primary)
  values
    (family_olivia, 'Hannah Nguyen', 'hannah.nguyen@example.com', '(555) 210-1111', true),
    (family_olivia, 'Minh Nguyen', 'minh.nguyen@example.com', '(555) 210-2222', false),
    (family_jayden, 'Avery Cole', 'avery.cole@example.com', '(555) 210-3333', true),
    (family_noah, 'Grace Kim', 'grace.kim@example.com', '(555) 210-4444', true),
    (family_lina, 'Priya Patel', 'priya.patel@example.com', '(555) 210-5555', true),
    (family_mateo, 'Sofia Santos', 'sofia.santos@example.com', '(555) 210-6666', true);

  insert into public.student_class_assignments (student_id, class_id)
  values
    (student_olivia, class_math),
    (student_olivia, class_english),
    (student_jayden, class_science),
    (student_jayden, class_history),
    (student_noah, class_coding),
    (student_lina, class_english),
    (student_lina, class_history),
    (student_mateo, class_math),
    (student_mateo, class_science);
end $$;

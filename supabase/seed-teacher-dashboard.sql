-- Replace the teacher UUID below with the auth.users.id for your account.
-- You can find it with: select id, email from auth.users;

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
begin
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

  insert into public.students (
    teacher_id,
    first_name,
    last_name,
    grade_level,
    email,
    tuition_amount,
    tuition_status
  )
  values
    (v_teacher_id, 'Olivia', 'Nguyen', '9', 'olivia.nguyen@example.com', 420, 'current'),
    (v_teacher_id, 'Jayden', 'Cole', '10', 'jayden.cole@example.com', 380, 'past-due'),
    (v_teacher_id, 'Noah', 'Kim', '11', 'noah.kim@example.com', 460, 'current'),
    (v_teacher_id, 'Lina', 'Patel', '8', 'lina.patel@example.com', 400, 'scholarship'),
    (v_teacher_id, 'Mateo', 'Santos', '12', 'mateo.santos@example.com', 500, 'current');

  -- Re-query student IDs to avoid relying on insert order.
  select id into student_olivia from public.students where teacher_id = v_teacher_id and first_name = 'Olivia' limit 1;
  select id into student_jayden from public.students where teacher_id = v_teacher_id and first_name = 'Jayden' limit 1;
  select id into student_noah from public.students where teacher_id = v_teacher_id and first_name = 'Noah' limit 1;
  select id into student_lina from public.students where teacher_id = v_teacher_id and first_name = 'Lina' limit 1;
  select id into student_mateo from public.students where teacher_id = v_teacher_id and first_name = 'Mateo' limit 1;

  insert into public.student_parents (student_id, name, email, phone, is_primary)
  values
    (student_olivia, 'Hannah Nguyen', 'hannah.nguyen@example.com', '(555) 210-1111', true),
    (student_olivia, 'Minh Nguyen', 'minh.nguyen@example.com', '(555) 210-2222', false),
    (student_jayden, 'Avery Cole', 'avery.cole@example.com', '(555) 210-3333', true),
    (student_noah, 'Grace Kim', 'grace.kim@example.com', '(555) 210-4444', true),
    (student_lina, 'Priya Patel', 'priya.patel@example.com', '(555) 210-5555', true),
    (student_mateo, 'Sofia Santos', 'sofia.santos@example.com', '(555) 210-6666', true);

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

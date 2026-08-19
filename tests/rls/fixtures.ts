import { serviceClient } from "./helpers";

const PASSWORD = "rls-test-password-123!";

export type Fixtures = Awaited<ReturnType<typeof createFixtures>>;

/**
 * Two teachers, each with their own family/student/class, so tests can
 * assert both "can see my own" and "can't see the other's" in one setup.
 * Family A additionally gets a second parent and a quiz assigned to its
 * class, covering today's two RLS fixes (family_parents visibility,
 * quiz_questions visibility) without a third teacher/family.
 */
export async function createFixtures() {
  const admin = serviceClient();

  const teacherA = await createUser(admin, "rls-teacher-a@example.test");
  const teacherB = await createUser(admin, "rls-teacher-b@example.test");
  const parentA1 = await createUser(admin, "rls-parent-a1@example.test");
  const parentA2 = await createUser(admin, "rls-parent-a2@example.test");
  const parentB1 = await createUser(admin, "rls-parent-b1@example.test");

  await admin.from("teachers").insert([
    { user_id: teacherA.id },
    { user_id: teacherB.id },
  ]);

  const familyA = await insertOne(admin, "families", { teacher_id: teacherA.id });
  const familyB = await insertOne(admin, "families", { teacher_id: teacherB.id });

  await admin.from("family_parents").insert([
    {
      family_id: familyA.id,
      user_id: parentA1.id,
      name: "Parent A1",
      email: parentA1.email,
      is_primary: true,
    },
    {
      family_id: familyA.id,
      user_id: parentA2.id,
      name: "Parent A2",
      email: parentA2.email,
      is_primary: false,
    },
  ]);
  await admin.from("family_parents").insert({
    family_id: familyB.id,
    user_id: parentB1.id,
    name: "Parent B1",
    email: parentB1.email,
    is_primary: true,
  });

  const studentA = await insertOne(admin, "students", {
    teacher_id: teacherA.id,
    family_id: familyA.id,
    first_name: "Student",
    last_name: "A",
  });
  const studentB = await insertOne(admin, "students", {
    teacher_id: teacherB.id,
    family_id: familyB.id,
    first_name: "Student",
    last_name: "B",
  });

  const classA = await insertOne(admin, "classes", {
    teacher_id: teacherA.id,
    name: "RLS Test Class A",
    hours_per_week: 1,
  });
  const classB = await insertOne(admin, "classes", {
    teacher_id: teacherB.id,
    name: "RLS Test Class B",
    hours_per_week: 1,
  });
  await admin
    .from("student_class_assignments")
    .insert({ student_id: studentA.id, class_id: classA.id });

  const quizA = await insertOne(admin, "quizzes", {
    teacher_id: teacherA.id,
    title: "RLS Test Quiz A",
  });
  await admin
    .from("quiz_assignments")
    .insert({ quiz_id: quizA.id, class_id: classA.id });
  const questionA = await insertOne(admin, "quiz_questions", {
    quiz_id: quizA.id,
    question_text: "2 + 2 = ?",
    question_type: "multiple_choice",
  });

  return {
    password: PASSWORD,
    teacherA,
    teacherB,
    parentA1,
    parentA2,
    parentB1,
    familyA,
    familyB,
    studentA,
    studentB,
    classA,
    classB,
    quizA,
    questionA,
  };
}

export async function cleanupFixtures(fixtures: Fixtures) {
  const admin = serviceClient();

  await admin
    .from("student_class_assignments")
    .delete()
    .in("student_id", [fixtures.studentA.id, fixtures.studentB.id]);
  await admin.from("quiz_assignments").delete().eq("quiz_id", fixtures.quizA.id);
  await admin.from("quiz_questions").delete().eq("quiz_id", fixtures.quizA.id);
  await admin.from("quizzes").delete().eq("id", fixtures.quizA.id);
  await admin
    .from("classes")
    .delete()
    .in("id", [fixtures.classA.id, fixtures.classB.id]);
  await admin
    .from("students")
    .delete()
    .in("id", [fixtures.studentA.id, fixtures.studentB.id]);
  await admin
    .from("family_parents")
    .delete()
    .in("family_id", [fixtures.familyA.id, fixtures.familyB.id]);
  await admin
    .from("families")
    .delete()
    .in("id", [fixtures.familyA.id, fixtures.familyB.id]);
  await admin
    .from("teachers")
    .delete()
    .in("user_id", [fixtures.teacherA.id, fixtures.teacherB.id]);

  for (const user of [
    fixtures.teacherA,
    fixtures.teacherB,
    fixtures.parentA1,
    fixtures.parentA2,
    fixtures.parentB1,
  ]) {
    await admin.auth.admin.deleteUser(user.id);
  }
}

async function createUser(
  admin: ReturnType<typeof serviceClient>,
  email: string,
) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user) {
    throw new Error(`Failed to create fixture user ${email}: ${error?.message}`);
  }
  return { id: data.user.id, email };
}

async function insertOne(
  admin: ReturnType<typeof serviceClient>,
  table: string,
  values: Record<string, unknown>,
) {
  const { data, error } = await admin
    .from(table)
    .insert(values)
    .select("id")
    .single();
  if (error || !data) {
    throw new Error(`Failed to insert fixture row into ${table}: ${error?.message}`);
  }
  return { id: data.id as string };
}

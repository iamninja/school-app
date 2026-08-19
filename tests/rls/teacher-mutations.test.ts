import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { signInAs, serviceClient } from "./helpers";
import { cleanupFixtures, createFixtures, type Fixtures } from "./fixtures";

/**
 * These exercise the "Teachers manage X" mutation policies directly - the
 * app-layer server actions (app/protected/teacher/actions.ts) already have
 * unit test coverage with a mocked Supabase client, but nothing previously
 * proved what the real RLS policies allow or block on their own. That gap
 * matters here specifically: enrollStudentInClassAction/
 * unenrollStudentFromClassAction added an explicit app-layer ownership
 * check on the *class* side because "Teachers manage student classes"
 * only checks the *student* side - this file proves that gap is real at
 * the database level, not just a defensive assumption.
 */
describe("RLS: teacher mutations", () => {
  let fixtures: Fixtures;
  let teacherA: Awaited<ReturnType<typeof signInAs>>;

  beforeAll(async () => {
    fixtures = await createFixtures();
    teacherA = await signInAs(fixtures.teacherA.email, fixtures.password);
  }, 30000);

  afterAll(async () => {
    await cleanupFixtures(fixtures);
  }, 30000);

  it("lets a teacher unenroll and re-enroll their own student in their own class", async () => {
    const removed = await teacherA
      .from("student_class_assignments")
      .delete()
      .eq("student_id", fixtures.studentA.id)
      .eq("class_id", fixtures.classA.id)
      .select("id");
    expect(removed.error).toBeNull();
    expect(removed.data).toHaveLength(1);

    const readBack = await serviceClient()
      .from("student_class_assignments")
      .select("id")
      .eq("student_id", fixtures.studentA.id)
      .eq("class_id", fixtures.classA.id);
    expect(readBack.data).toHaveLength(0);

    const reAdded = await teacherA
      .from("student_class_assignments")
      .insert({ student_id: fixtures.studentA.id, class_id: fixtures.classA.id })
      .select("id");
    expect(reAdded.error).toBeNull();
    expect(reAdded.data).toHaveLength(1);
  });

  it("RLS alone permits a cross-teacher class assignment - the app layer's class-ownership check is load-bearing, not redundant", async () => {
    const crossTeacherInsert = await teacherA
      .from("student_class_assignments")
      .insert({ student_id: fixtures.studentA.id, class_id: fixtures.classB.id })
      .select("id");

    // "Teachers manage student classes" WITH CHECK only verifies the
    // student belongs to the caller - it never checks the class, so this
    // insert is expected to succeed even though classB belongs to
    // teacherB. If this assertion ever starts failing, it means someone
    // tightened the policy to also check the class - which would be
    // welcome, but the app-layer requireOwnedClass check in
    // enrollStudentInClassAction should stay either way as defense in depth.
    expect(crossTeacherInsert.error).toBeNull();
    expect(crossTeacherInsert.data).toHaveLength(1);

    await serviceClient()
      .from("student_class_assignments")
      .delete()
      .eq("student_id", fixtures.studentA.id)
      .eq("class_id", fixtures.classB.id);
  });

  it("lets a teacher update their own student, not another teacher's", async () => {
    const ownUpdate = await teacherA
      .from("students")
      .update({ grade_level: "11" })
      .eq("id", fixtures.studentA.id)
      .select("id, grade_level");
    expect(ownUpdate.error).toBeNull();
    expect(ownUpdate.data).toHaveLength(1);
    expect(ownUpdate.data?.[0].grade_level).toBe("11");

    const otherUpdate = await teacherA
      .from("students")
      .update({ grade_level: "12" })
      .eq("id", fixtures.studentB.id)
      .select("id");
    expect(otherUpdate.error).toBeNull();
    expect(otherUpdate.data).toHaveLength(0);

    const stillUnchanged = await serviceClient()
      .from("students")
      .select("grade_level")
      .eq("id", fixtures.studentB.id)
      .single();
    expect(stillUnchanged.data?.grade_level).not.toBe("12");
  });

  it("lets a teacher update their own family's parent contact, not another teacher's family", async () => {
    const ownUpdate = await teacherA
      .from("family_parents")
      .update({ phone: "555-0000" })
      .eq("family_id", fixtures.familyA.id)
      .eq("user_id", fixtures.parentA1.id)
      .select("id, phone");
    expect(ownUpdate.error).toBeNull();
    expect(ownUpdate.data).toHaveLength(1);
    expect(ownUpdate.data?.[0].phone).toBe("555-0000");

    const otherUpdate = await teacherA
      .from("family_parents")
      .update({ phone: "555-9999" })
      .eq("family_id", fixtures.familyB.id)
      .select("id");
    expect(otherUpdate.error).toBeNull();
    expect(otherUpdate.data).toHaveLength(0);
  });
});

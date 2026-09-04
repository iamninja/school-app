import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { signInAs, serviceClient } from "./helpers";
import { cleanupFixtures, createFixtures, type Fixtures } from "./fixtures";

/**
 * tests/test_assignments RLS. Two things this proves beyond simple
 * ownership isolation:
 *
 * - Unlike calendar_events/attendance_records, test_assignments' FKs are a
 *   plain CASCADE (not SET NULL + snapshot) - deleting the parent test
 *   takes its roster with it. tests.class_id, however, DOES use the
 *   snapshot+SET NULL convention, so a class delete must survive.
 * - The status/shape CHECK constraints are load-bearing, not just app-layer
 *   validation - a direct insert that violates them must be rejected by
 *   Postgres itself.
 */
describe("RLS: tests / test_assignments", () => {
  let fixtures: Fixtures;
  let teacherA: Awaited<ReturnType<typeof signInAs>>;
  let teacherB: Awaited<ReturnType<typeof signInAs>>;
  let parentA1: Awaited<ReturnType<typeof signInAs>>;
  let parentB1: Awaited<ReturnType<typeof signInAs>>;
  let studentA: Awaited<ReturnType<typeof signInAs>>;
  const createdTestIds: string[] = [];
  const STUDENT_A_EMAIL = "rls-tests-student-a@example.test";

  beforeAll(async () => {
    fixtures = await createFixtures();
    teacherA = await signInAs(fixtures.teacherA.email, fixtures.password);
    teacherB = await signInAs(fixtures.teacherB.email, fixtures.password);
    parentA1 = await signInAs(fixtures.parentA1.email, fixtures.password);
    parentB1 = await signInAs(fixtures.parentB1.email, fixtures.password);

    const admin = serviceClient();
    const studentAAuth = await admin.auth.admin.createUser({
      email: STUDENT_A_EMAIL,
      password: fixtures.password,
      email_confirm: true,
    });
    await admin
      .from("students")
      .update({ user_id: studentAAuth.data.user!.id })
      .eq("id", fixtures.studentA.id);
    studentA = await signInAs(STUDENT_A_EMAIL, fixtures.password);
  }, 30000);

  afterEach(async () => {
    if (createdTestIds.length > 0) {
      // test_assignments cascades with its parent test - one delete covers both.
      await serviceClient().from("tests").delete().in("id", createdTestIds);
      createdTestIds.length = 0;
    }
  });

  afterAll(async () => {
    const admin = serviceClient();
    await admin
      .from("students")
      .update({ user_id: null })
      .eq("id", fixtures.studentA.id);
    const { data: listed } = await admin.auth.admin.listUsers();
    for (const user of listed.users.filter(
      (u) => u.email === STUDENT_A_EMAIL,
    )) {
      await admin.auth.admin.deleteUser(user.id);
    }
    await cleanupFixtures(fixtures);
  }, 30000);

  async function insertTestAndAssignment(
    admin: ReturnType<typeof serviceClient>,
    overrides: Record<string, unknown> = {},
  ) {
    const { data: test, error } = await admin
      .from("tests")
      .insert({
        teacher_id: fixtures.teacherA.id,
        kind: "short_test",
        title: "RLS Test Quiz",
        max_score: 20,
        duration_minutes: 45,
        class_id: fixtures.classA.id,
        class_name: "RLS Test Class A",
        ...overrides,
      })
      .select("id")
      .single();
    if (error || !test) {
      throw new Error(`Failed to insert fixture test: ${error?.message}`);
    }
    createdTestIds.push(test.id);

    const { data: assignment, error: assignmentError } = await admin
      .from("test_assignments")
      .insert({
        teacher_id: fixtures.teacherA.id,
        test_id: test.id,
        student_id: fixtures.studentA.id,
        kind: "short_test",
      })
      .select("id")
      .single();
    if (assignmentError || !assignment) {
      throw new Error(
        `Failed to insert fixture test assignment: ${assignmentError?.message}`,
      );
    }
    return { testId: test.id as string, assignmentId: assignment.id as string };
  }

  it("lets a teacher create and read their own test and its assignments", async () => {
    const { data: test, error } = await teacherA
      .from("tests")
      .insert({
        teacher_id: fixtures.teacherA.id,
        kind: "short_test",
        title: "Owned by teacher A",
        max_score: 20,
        duration_minutes: 30,
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    if (test) createdTestIds.push(test.id);

    const { error: assignmentError } = await teacherA
      .from("test_assignments")
      .insert({
        teacher_id: fixtures.teacherA.id,
        test_id: test!.id,
        student_id: fixtures.studentA.id,
        kind: "short_test",
      });
    expect(assignmentError).toBeNull();
  });

  it("blocks a teacher from reading another teacher's tests or assignments", async () => {
    const admin = serviceClient();
    const { testId } = await insertTestAndAssignment(admin);

    const { data: testRows } = await teacherB
      .from("tests")
      .select("id")
      .eq("id", testId);
    expect(testRows ?? []).toHaveLength(0);

    const { data: assignmentRows } = await teacherB
      .from("test_assignments")
      .select("id")
      .eq("test_id", testId);
    expect(assignmentRows ?? []).toHaveLength(0);
  });

  it("blocks a parent from writing tests or test assignments", async () => {
    const { error } = await parentA1.from("tests").insert({
      teacher_id: fixtures.teacherA.id,
      kind: "short_test",
      title: "Should not be allowed",
      max_score: 20,
      duration_minutes: 30,
    });
    expect(error).not.toBeNull();
  });

  it("lets a parent see their own child's test and assignment, never another family's", async () => {
    const admin = serviceClient();
    const { testId, assignmentId } = await insertTestAndAssignment(admin);

    const { data: ownTest } = await parentA1
      .from("tests")
      .select("id")
      .eq("id", testId);
    expect(ownTest).toHaveLength(1);

    const { data: ownAssignment } = await parentA1
      .from("test_assignments")
      .select("id")
      .eq("id", assignmentId);
    expect(ownAssignment).toHaveLength(1);

    const { data: otherFamilyTest } = await parentB1
      .from("tests")
      .select("id")
      .eq("id", testId);
    expect(otherFamilyTest ?? []).toHaveLength(0);

    const { data: otherFamilyAssignment } = await parentB1
      .from("test_assignments")
      .select("id")
      .eq("id", assignmentId);
    expect(otherFamilyAssignment ?? []).toHaveLength(0);
  });

  it("lets a signed-in student see their own test and assignment", async () => {
    const admin = serviceClient();
    const { testId, assignmentId } = await insertTestAndAssignment(admin);

    const { data: testRows } = await studentA
      .from("tests")
      .select("id")
      .eq("id", testId);
    expect(testRows).toHaveLength(1);

    const { data: assignmentRows } = await studentA
      .from("test_assignments")
      .select("id")
      .eq("id", assignmentId);
    expect(assignmentRows).toHaveLength(1);
  });

  it("rejects a mock_exam row with a deadline set instead of a scheduled date (shape check)", async () => {
    const admin = serviceClient();
    const { error } = await admin.from("tests").insert({
      teacher_id: fixtures.teacherA.id,
      kind: "mock_exam",
      title: "Bad shape",
      max_score: 20,
      duration_minutes: 120,
      deadline_at: "2026-09-20T00:00:00Z",
    });
    expect(error).not.toBeNull();
  });

  it("rejects a short_test row with a scheduled date set (shape check)", async () => {
    const admin = serviceClient();
    const { error } = await admin.from("tests").insert({
      teacher_id: fixtures.teacherA.id,
      kind: "short_test",
      title: "Bad shape",
      max_score: 20,
      duration_minutes: 30,
      scheduled_date: "2026-09-20",
    });
    expect(error).not.toBeNull();
  });

  it("rejects a duration outside the bounds for its kind", async () => {
    const admin = serviceClient();
    const { error } = await admin.from("tests").insert({
      teacher_id: fixtures.teacherA.id,
      kind: "short_test",
      title: "Too long for a short test",
      max_score: 20,
      duration_minutes: 90,
    });
    expect(error).not.toBeNull();
  });

  it("rejects a test_assignments row claiming 'marked' status without a score", async () => {
    const admin = serviceClient();
    const { testId } = await insertTestAndAssignment(admin, {
      title: "For status check",
    });

    const { error } = await admin.from("test_assignments").insert({
      teacher_id: fixtures.teacherA.id,
      test_id: testId,
      student_id: fixtures.studentB.id,
      kind: "short_test",
      status: "marked",
      taken_at: new Date().toISOString(),
      // score deliberately omitted - must be rejected.
    });
    expect(error).not.toBeNull();
  });

  it("rejects a second assignment for the same test/student pair", async () => {
    const admin = serviceClient();
    const { testId } = await insertTestAndAssignment(admin);

    const { error } = await admin.from("test_assignments").insert({
      teacher_id: fixtures.teacherA.id,
      test_id: testId,
      student_id: fixtures.studentA.id,
      kind: "short_test",
    });
    expect(error).not.toBeNull();
  });

  it("survives deleting a class that still has a test referencing it, snapshotting class_name and setting class_id null", async () => {
    const admin = serviceClient();
    const { data: throwawayClass, error: classError } = await admin
      .from("classes")
      .insert({
        teacher_id: fixtures.teacherA.id,
        name: "Throwaway Class For Test Delete",
        hours_per_week: 1,
      })
      .select("id")
      .single();
    expect(classError).toBeNull();

    const { data: test, error: testError } = await teacherA
      .from("tests")
      .insert({
        teacher_id: fixtures.teacherA.id,
        kind: "short_test",
        title: "Class delete survival",
        max_score: 20,
        duration_minutes: 30,
        class_id: throwawayClass!.id,
        class_name: "Throwaway Class For Test Delete",
      })
      .select("id")
      .single();
    expect(testError).toBeNull();
    if (test) createdTestIds.push(test.id);

    const { error: deleteError } = await teacherA
      .from("classes")
      .delete()
      .eq("id", throwawayClass!.id);
    expect(deleteError).toBeNull();

    const { data: survived } = await admin
      .from("tests")
      .select("class_id, class_name")
      .eq("id", test!.id)
      .single();
    expect(survived?.class_id).toBeNull();
    expect(survived?.class_name).toBe("Throwaway Class For Test Delete");
  });

  it("cascades: deleting a test removes its assignments (unlike the snapshot tables)", async () => {
    const admin = serviceClient();
    const { testId, assignmentId } = await insertTestAndAssignment(admin);

    const { error: deleteError } = await teacherA
      .from("tests")
      .delete()
      .eq("id", testId);
    expect(deleteError).toBeNull();
    createdTestIds.length = 0; // already gone, afterEach has nothing to clean up

    const { data: survivingAssignment } = await admin
      .from("test_assignments")
      .select("id")
      .eq("id", assignmentId);
    expect(survivingAssignment ?? []).toHaveLength(0);
  });
});

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { signInAs, serviceClient } from "./helpers";
import { cleanupFixtures, createFixtures, type Fixtures } from "./fixtures";

/**
 * assessments/assessment_assignments RLS. Two things this proves beyond
 * simple ownership isolation:
 *
 * - Unlike calendar_events/attendance_records, assessment_assignments' FKs
 *   are a plain CASCADE (not SET NULL + snapshot) - deleting the parent
 *   assessment takes its roster with it. assessments.class_id, however,
 *   DOES use the snapshot+SET NULL convention, so a class delete must
 *   survive.
 * - The status/shape CHECK constraints are load-bearing, not just
 *   app-layer validation - a direct insert that violates them must be
 *   rejected by Postgres itself.
 */
describe("RLS: assessments / assessment_assignments", () => {
  let fixtures: Fixtures;
  let teacherA: Awaited<ReturnType<typeof signInAs>>;
  let teacherB: Awaited<ReturnType<typeof signInAs>>;
  let parentA1: Awaited<ReturnType<typeof signInAs>>;
  let parentB1: Awaited<ReturnType<typeof signInAs>>;
  let studentA: Awaited<ReturnType<typeof signInAs>>;
  const createdAssessmentIds: string[] = [];
  const STUDENT_A_EMAIL = "rls-assessments-student-a@example.test";

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
    if (createdAssessmentIds.length > 0) {
      // assessment_assignments cascades with its parent assessment - one
      // delete covers both.
      await serviceClient()
        .from("assessments")
        .delete()
        .in("id", createdAssessmentIds);
      createdAssessmentIds.length = 0;
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

  async function insertAssessmentAndAssignment(
    admin: ReturnType<typeof serviceClient>,
    overrides: Record<string, unknown> = {},
  ) {
    const { data: assessment, error } = await admin
      .from("assessments")
      .insert({
        teacher_id: fixtures.teacherA.id,
        kind: "short_assessment",
        title: "RLS Test Assessment",
        max_score: 20,
        duration_minutes: 45,
        class_id: fixtures.classA.id,
        class_name: "RLS Test Class A",
        ...overrides,
      })
      .select("id")
      .single();
    if (error || !assessment) {
      throw new Error(`Failed to insert fixture assessment: ${error?.message}`);
    }
    createdAssessmentIds.push(assessment.id);

    const { data: assignment, error: assignmentError } = await admin
      .from("assessment_assignments")
      .insert({
        teacher_id: fixtures.teacherA.id,
        assessment_id: assessment.id,
        student_id: fixtures.studentA.id,
        kind: "short_assessment",
      })
      .select("id")
      .single();
    if (assignmentError || !assignment) {
      throw new Error(
        `Failed to insert fixture assessment assignment: ${assignmentError?.message}`,
      );
    }
    return {
      assessmentId: assessment.id as string,
      assignmentId: assignment.id as string,
    };
  }

  it("lets a teacher create and read their own assessment and its assignments", async () => {
    const { data: assessment, error } = await teacherA
      .from("assessments")
      .insert({
        teacher_id: fixtures.teacherA.id,
        kind: "short_assessment",
        title: "Owned by teacher A",
        max_score: 20,
        duration_minutes: 30,
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    if (assessment) createdAssessmentIds.push(assessment.id);

    const { error: assignmentError } = await teacherA
      .from("assessment_assignments")
      .insert({
        teacher_id: fixtures.teacherA.id,
        assessment_id: assessment!.id,
        student_id: fixtures.studentA.id,
        kind: "short_assessment",
      });
    expect(assignmentError).toBeNull();
  });

  it("blocks a teacher from reading another teacher's assessments or assignments", async () => {
    const admin = serviceClient();
    const { assessmentId } = await insertAssessmentAndAssignment(admin);

    const { data: assessmentRows } = await teacherB
      .from("assessments")
      .select("id")
      .eq("id", assessmentId);
    expect(assessmentRows ?? []).toHaveLength(0);

    const { data: assignmentRows } = await teacherB
      .from("assessment_assignments")
      .select("id")
      .eq("assessment_id", assessmentId);
    expect(assignmentRows ?? []).toHaveLength(0);
  });

  it("blocks a parent from writing assessments or assessment assignments", async () => {
    const { error } = await parentA1.from("assessments").insert({
      teacher_id: fixtures.teacherA.id,
      kind: "short_assessment",
      title: "Should not be allowed",
      max_score: 20,
      duration_minutes: 30,
    });
    expect(error).not.toBeNull();
  });

  it("lets a parent see their own child's assessment and assignment, never another family's", async () => {
    const admin = serviceClient();
    const { assessmentId, assignmentId } =
      await insertAssessmentAndAssignment(admin);

    const { data: ownAssessment } = await parentA1
      .from("assessments")
      .select("id")
      .eq("id", assessmentId);
    expect(ownAssessment).toHaveLength(1);

    const { data: ownAssignment } = await parentA1
      .from("assessment_assignments")
      .select("id")
      .eq("id", assignmentId);
    expect(ownAssignment).toHaveLength(1);

    const { data: otherFamilyAssessment } = await parentB1
      .from("assessments")
      .select("id")
      .eq("id", assessmentId);
    expect(otherFamilyAssessment ?? []).toHaveLength(0);

    const { data: otherFamilyAssignment } = await parentB1
      .from("assessment_assignments")
      .select("id")
      .eq("id", assignmentId);
    expect(otherFamilyAssignment ?? []).toHaveLength(0);
  });

  it("lets a signed-in student see their own assessment and assignment", async () => {
    const admin = serviceClient();
    const { assessmentId, assignmentId } =
      await insertAssessmentAndAssignment(admin);

    const { data: assessmentRows } = await studentA
      .from("assessments")
      .select("id")
      .eq("id", assessmentId);
    expect(assessmentRows).toHaveLength(1);

    const { data: assignmentRows } = await studentA
      .from("assessment_assignments")
      .select("id")
      .eq("id", assignmentId);
    expect(assignmentRows).toHaveLength(1);
  });

  it("rejects a mock_exam row with a deadline set instead of a scheduled date (shape check)", async () => {
    const admin = serviceClient();
    const { error } = await admin.from("assessments").insert({
      teacher_id: fixtures.teacherA.id,
      kind: "mock_exam",
      title: "Bad shape",
      max_score: 20,
      duration_minutes: 120,
      deadline_at: "2026-09-20T00:00:00Z",
    });
    expect(error).not.toBeNull();
  });

  it("rejects a short_assessment row with a scheduled date set (shape check)", async () => {
    const admin = serviceClient();
    const { error } = await admin.from("assessments").insert({
      teacher_id: fixtures.teacherA.id,
      kind: "short_assessment",
      title: "Bad shape",
      max_score: 20,
      duration_minutes: 30,
      scheduled_date: "2026-09-20",
    });
    expect(error).not.toBeNull();
  });

  it("rejects a duration outside the bounds for its kind", async () => {
    const admin = serviceClient();
    const { error } = await admin.from("assessments").insert({
      teacher_id: fixtures.teacherA.id,
      kind: "short_assessment",
      title: "Too long for a short assessment",
      max_score: 20,
      duration_minutes: 90,
    });
    expect(error).not.toBeNull();
  });

  it("rejects a grade value outside the fixed code list", async () => {
    const admin = serviceClient();
    const { error } = await admin.from("assessments").insert({
      teacher_id: fixtures.teacherA.id,
      kind: "short_assessment",
      title: "Bad grade",
      max_score: 20,
      duration_minutes: 30,
      grade: "not-a-real-grade",
    });
    expect(error).not.toBeNull();
  });

  it("accepts a null grade and a valid grade code", async () => {
    const admin = serviceClient();
    const { assessmentId } = await insertAssessmentAndAssignment(admin, {
      title: "No grade set",
    });
    const { data: noGrade } = await admin
      .from("assessments")
      .select("grade")
      .eq("id", assessmentId)
      .single();
    expect(noGrade?.grade).toBeNull();

    const { error } = await admin
      .from("assessments")
      .update({ grade: "lyk_b" })
      .eq("id", assessmentId);
    expect(error).toBeNull();
  });

  it("rejects an assessment_assignments row claiming 'marked' status without a score", async () => {
    const admin = serviceClient();
    const { assessmentId } = await insertAssessmentAndAssignment(admin, {
      title: "For status check",
    });

    const { error } = await admin.from("assessment_assignments").insert({
      teacher_id: fixtures.teacherA.id,
      assessment_id: assessmentId,
      student_id: fixtures.studentB.id,
      kind: "short_assessment",
      status: "marked",
      taken_at: new Date().toISOString(),
      // score deliberately omitted - must be rejected.
    });
    expect(error).not.toBeNull();
  });

  it("rejects a second assignment for the same assessment/student pair", async () => {
    const admin = serviceClient();
    const { assessmentId } = await insertAssessmentAndAssignment(admin);

    const { error } = await admin.from("assessment_assignments").insert({
      teacher_id: fixtures.teacherA.id,
      assessment_id: assessmentId,
      student_id: fixtures.studentA.id,
      kind: "short_assessment",
    });
    expect(error).not.toBeNull();
  });

  it("survives deleting a class that still has an assessment referencing it, snapshotting class_name and setting class_id null", async () => {
    const admin = serviceClient();
    const { data: throwawayClass, error: classError } = await admin
      .from("classes")
      .insert({
        teacher_id: fixtures.teacherA.id,
        name: "Throwaway Class For Assessment Delete",
        hours_per_week: 1,
      })
      .select("id")
      .single();
    expect(classError).toBeNull();

    const { data: assessment, error: assessmentError } = await teacherA
      .from("assessments")
      .insert({
        teacher_id: fixtures.teacherA.id,
        kind: "short_assessment",
        title: "Class delete survival",
        max_score: 20,
        duration_minutes: 30,
        class_id: throwawayClass!.id,
        class_name: "Throwaway Class For Assessment Delete",
      })
      .select("id")
      .single();
    expect(assessmentError).toBeNull();
    if (assessment) createdAssessmentIds.push(assessment.id);

    const { error: deleteError } = await teacherA
      .from("classes")
      .delete()
      .eq("id", throwawayClass!.id);
    expect(deleteError).toBeNull();

    const { data: survived } = await admin
      .from("assessments")
      .select("class_id, class_name")
      .eq("id", assessment!.id)
      .single();
    expect(survived?.class_id).toBeNull();
    expect(survived?.class_name).toBe("Throwaway Class For Assessment Delete");
  });

  it("cascades: deleting an assessment removes its assignments (unlike the snapshot tables)", async () => {
    const admin = serviceClient();
    const { assessmentId, assignmentId } =
      await insertAssessmentAndAssignment(admin);

    const { error: deleteError } = await teacherA
      .from("assessments")
      .delete()
      .eq("id", assessmentId);
    expect(deleteError).toBeNull();
    createdAssessmentIds.length = 0; // already gone, afterEach has nothing to clean up

    const { data: survivingAssignment } = await admin
      .from("assessment_assignments")
      .select("id")
      .eq("id", assignmentId);
    expect(survivingAssignment ?? []).toHaveLength(0);
  });
});

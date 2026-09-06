import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { signInAs, serviceClient } from "./helpers";
import { cleanupFixtures, createFixtures, type Fixtures } from "./fixtures";

/**
 * Opus security audit finding M1, 2026-09-05/06: RLS is row-level, not
 * column-level - a student assigned to a quiz could read every column of
 * their own accessible quiz_question_options/quiz_questions rows directly
 * over PostgREST, including the answer key (is_correct/model_answer),
 * regardless of what any particular fetch action selects around it.
 * 20260906120000_hide-quiz-answer-key-columns.sql revokes column-level
 * SELECT on both from `authenticated` entirely (teacher included - the app
 * now reads them exclusively via a service-role client, post ownership
 * check, in both quiz-actions.ts files). These tests hit real Postgres
 * directly with a real session, the same way the vulnerability itself
 * would have been exploited, rather than asserting against a mock.
 */
describe("RLS: quiz answer-key column exposure", () => {
  let fixtures: Fixtures;
  let teacherA: Awaited<ReturnType<typeof signInAs>>;
  let studentA: Awaited<ReturnType<typeof signInAs>>;
  let optionId: string;

  beforeAll(async () => {
    fixtures = await createFixtures();
    teacherA = await signInAs(fixtures.teacherA.email, fixtures.password);

    const admin = serviceClient();
    const studentAAuth = await admin.auth.admin.createUser({
      email: "rls-answer-key-student-a@example.test",
      password: fixtures.password,
      email_confirm: true,
    });
    await admin
      .from("students")
      .update({ user_id: studentAAuth.data.user!.id })
      .eq("id", fixtures.studentA.id);
    studentA = await signInAs(
      "rls-answer-key-student-a@example.test",
      fixtures.password,
    );

    await admin
      .from("quiz_questions")
      .update({ model_answer: "The secret model answer" })
      .eq("id", fixtures.questionA.id);
    const { data: option } = await admin
      .from("quiz_question_options")
      .insert({
        question_id: fixtures.questionA.id,
        option_text: "4",
        is_correct: true,
        order_index: 0,
      })
      .select("id")
      .single();
    optionId = option!.id;
  }, 30000);

  afterAll(async () => {
    const admin = serviceClient();
    await admin
      .from("students")
      .update({ user_id: null })
      .eq("id", fixtures.studentA.id);
    const { data: users } = await admin.auth.admin.listUsers();
    for (const user of users.users.filter((u) =>
      u.email?.startsWith("rls-answer-key-"),
    )) {
      await admin.auth.admin.deleteUser(user.id);
    }
    await cleanupFixtures(fixtures);
  }, 30000);

  it("blocks an assigned student from reading is_correct directly, even on their own accessible row", async () => {
    const { error } = await studentA
      .from("quiz_question_options")
      .select("id, is_correct")
      .eq("id", optionId)
      .single();
    expect(error).not.toBeNull();
  });

  it("still lets an assigned student read the option's other columns directly", async () => {
    const { data, error } = await studentA
      .from("quiz_question_options")
      .select("id, option_text")
      .eq("id", optionId)
      .single();
    expect(error).toBeNull();
    expect(data?.option_text).toBe("4");
  });

  it("blocks an assigned student from reading model_answer directly", async () => {
    const { error } = await studentA
      .from("quiz_questions")
      .select("id, model_answer")
      .eq("id", fixtures.questionA.id)
      .single();
    expect(error).not.toBeNull();
  });

  it("still lets an assigned student read the question's other columns directly", async () => {
    const { data, error } = await studentA
      .from("quiz_questions")
      .select("id, question_text")
      .eq("id", fixtures.questionA.id)
      .single();
    expect(error).toBeNull();
    expect(data?.question_text).toBe("2 + 2 = ?");
  });

  // The column revoke is unconditional on the `authenticated` Postgres
  // role - teacher and student are the same role, distinguished only by
  // RLS predicates like is_teacher(), which column privileges can't
  // express. The app already moved every legitimate teacher-side read of
  // these columns to a service-role client (quiz-actions.ts); this proves
  // the teacher's own raw session genuinely can't shortcut around that.
  it("blocks the owning teacher's own raw session from reading is_correct directly too", async () => {
    const { error } = await teacherA
      .from("quiz_question_options")
      .select("id, is_correct")
      .eq("id", optionId)
      .single();
    expect(error).not.toBeNull();
  });

  it("blocks the owning teacher's own raw session from reading model_answer directly too", async () => {
    const { error } = await teacherA
      .from("quiz_questions")
      .select("id, model_answer")
      .eq("id", fixtures.questionA.id)
      .single();
    expect(error).not.toBeNull();
  });
});

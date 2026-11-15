import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { signInAs, serviceClient } from "./helpers";
import { cleanupFixtures, createFixtures, type Fixtures } from "./fixtures";

/**
 * A student's own records - quiz attempts and scores, homework, class
 * files, attendance alerts - must never reach another family, and a
 * student must not be able to write their own score directly over
 * PostgREST, bypassing the server's grading (app/student-dashboard/quiz-actions.ts).
 *
 * Family A: studentA (in classA, which has quizA), parentA1.
 * Family B: studentB (in classB, teacher B's), parentB1.
 */
describe("RLS: student data", () => {
  let fixtures: Fixtures;
  let teacherA: Awaited<ReturnType<typeof signInAs>>;
  let parentA1: Awaited<ReturnType<typeof signInAs>>;
  let parentB1: Awaited<ReturnType<typeof signInAs>>;
  let studentA: Awaited<ReturnType<typeof signInAs>>;
  let studentB: Awaited<ReturnType<typeof signInAs>>;
  let anon: Awaited<ReturnType<typeof signInAs>>;
  let attemptA: string;
  let homeworkA: string;
  let homeworkB: string;
  let fileA: string;
  let fileB: string;

  const rowsSeenBy = async (client: typeof studentA, table: string, column: string, value: string) =>
    ((await client.from(table).select(column).eq(column, value)).data ?? []).length;

  beforeAll(async () => {
    fixtures = await createFixtures();
    const admin = serviceClient();

    for (const [studentId, email] of [
      [fixtures.studentA.id, "rls-student-data-a@example.test"],
      [fixtures.studentB.id, "rls-student-data-b@example.test"],
    ]) {
      const { data } = await admin.auth.admin.createUser({ email, password: fixtures.password, email_confirm: true });
      await admin.from("students").update({ user_id: data.user!.id }).eq("id", studentId);
    }
    await admin.from("student_class_assignments").insert({ student_id: fixtures.studentB.id, class_id: fixtures.classB.id });

    teacherA = await signInAs(fixtures.teacherA.email, fixtures.password);
    parentA1 = await signInAs(fixtures.parentA1.email, fixtures.password);
    parentB1 = await signInAs(fixtures.parentB1.email, fixtures.password);
    studentA = await signInAs("rls-student-data-a@example.test", fixtures.password);
    studentB = await signInAs("rls-student-data-b@example.test", fixtures.password);
    anon = createClient(process.env.LOCAL_SUPABASE_URL!, process.env.LOCAL_SUPABASE_ANON_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    }) as typeof studentA;

    // Student A's graded attempt at quizA, as the server writes it: 1 of 10.
    await admin.from("quiz_questions").update({ points: 10 }).eq("id", fixtures.questionA.id);
    const { data: attempt } = await admin
      .from("quiz_attempts")
      .insert({ quiz_id: fixtures.quizA.id, student_id: fixtures.studentA.id, score: 1, quiz_title: "RLS Test Quiz A", max_score: 10 })
      .select("id")
      .single();
    attemptA = attempt!.id;
    await admin.from("quiz_attempt_answers").insert({ attempt_id: attemptA, question_id: fixtures.questionA.id, text_answer: "5", is_correct: false, points_awarded: 1 });
    await admin.from("quiz_attempt_bests").insert({ attempt_id: attemptA, score: 1, attempts_used: 1 });
    await admin.from("quiz_attempt_best_answers").insert({ attempt_id: attemptA, question_id: fixtures.questionA.id, text_answer: "5", is_correct: false, points_awarded: 1 });

    const homework = await admin
      .from("homework")
      .insert([
        { teacher_id: fixtures.teacherA.id, class_id: fixtures.classA.id, note: "Ασκήσεις 1-5" },
        { teacher_id: fixtures.teacherB.id, class_id: fixtures.classB.id, note: "Exercises 6-9" },
      ])
      .select("id, class_id");
    homeworkA = homework.data!.find((row) => row.class_id === fixtures.classA.id)!.id;
    homeworkB = homework.data!.find((row) => row.class_id === fixtures.classB.id)!.id;

    const files = await admin
      .from("class_files")
      .insert([
        { teacher_id: fixtures.teacherA.id, class_id: fixtures.classA.id, kind: "link", title: "Notes A", url: "https://example.test/a" },
        { teacher_id: fixtures.teacherB.id, class_id: fixtures.classB.id, kind: "link", title: "Notes B", url: "https://example.test/b" },
      ])
      .select("id, class_id");
    fileA = files.data!.find((row) => row.class_id === fixtures.classA.id)!.id;
    fileB = files.data!.find((row) => row.class_id === fixtures.classB.id)!.id;

    await admin.from("attendance_alerts").insert({ class_id: fixtures.classA.id, lesson_date: "2026-11-16" });
  }, 60000);

  afterAll(async () => {
    const admin = serviceClient();
    await admin.from("attendance_alerts").delete().in("class_id", [fixtures.classA.id, fixtures.classB.id]);
    await admin.from("class_files").delete().in("class_id", [fixtures.classA.id, fixtures.classB.id]);
    await admin.from("homework").delete().in("class_id", [fixtures.classA.id, fixtures.classB.id]);
    const { data: attempts } = await admin.from("quiz_attempts").select("id").in("student_id", [fixtures.studentA.id, fixtures.studentB.id]);
    const attemptIds = (attempts ?? []).map((row) => row.id);
    await admin.from("quiz_attempt_best_answers").delete().in("attempt_id", attemptIds);
    await admin.from("quiz_attempt_bests").delete().in("attempt_id", attemptIds);
    await admin.from("quiz_attempt_answers").delete().in("attempt_id", attemptIds);
    await admin.from("quiz_attempts").delete().in("id", attemptIds);
    await admin.from("student_class_assignments").delete().eq("student_id", fixtures.studentB.id);
    await admin.from("students").update({ user_id: null }).in("id", [fixtures.studentA.id, fixtures.studentB.id]);
    const { data: users } = await admin.auth.admin.listUsers();
    for (const user of users.users.filter((u) => u.email?.startsWith("rls-student-data-"))) {
      await admin.auth.admin.deleteUser(user.id);
    }
    await cleanupFixtures(fixtures);
  }, 60000);

  describe("quiz results", () => {
    it("are visible to the student, their parents and the teacher", async () => {
      for (const client of [studentA, parentA1, teacherA]) {
        expect(await rowsSeenBy(client, "quiz_attempts", "id", attemptA)).toBe(1);
        expect(await rowsSeenBy(client, "quiz_attempt_answers", "attempt_id", attemptA)).toBe(1);
        expect(await rowsSeenBy(client, "quiz_attempt_bests", "attempt_id", attemptA)).toBe(1);
        expect(await rowsSeenBy(client, "quiz_attempt_best_answers", "attempt_id", attemptA)).toBe(1);
      }
    });

    it("are hidden from another family and from guests", async () => {
      for (const client of [studentB, parentB1, anon]) {
        expect(await rowsSeenBy(client, "quiz_attempts", "id", attemptA)).toBe(0);
        expect(await rowsSeenBy(client, "quiz_attempt_answers", "attempt_id", attemptA)).toBe(0);
        expect(await rowsSeenBy(client, "quiz_attempt_bests", "attempt_id", attemptA)).toBe(0);
        expect(await rowsSeenBy(client, "quiz_attempt_best_answers", "attempt_id", attemptA)).toBe(0);
      }
    });

    it("can't be changed by a parent", async () => {
      await parentA1.from("quiz_attempt_bests").update({ score: 10 }).eq("attempt_id", attemptA);
      await parentA1.from("quiz_attempts").update({ score: 10 }).eq("id", attemptA);
      const { data } = await serviceClient().from("quiz_attempts").select("score").eq("id", attemptA).single();
      const { data: best } = await serviceClient().from("quiz_attempt_bests").select("score").eq("attempt_id", attemptA).single();
      expect([Number(data!.score), Number(best!.score)]).toEqual([1, 1]);
    });
  });

  describe("a student writing their own score directly, bypassing grading", () => {
    it("can't raise their official score", async () => {
      await studentA.from("quiz_attempts").update({ score: 10 }).eq("id", attemptA);
      const { data } = await serviceClient().from("quiz_attempts").select("score").eq("id", attemptA).single();
      expect(Number(data!.score)).toBe(1);
    });

    it("can't raise their best score", async () => {
      await studentA.from("quiz_attempt_bests").update({ score: 10 }).eq("attempt_id", attemptA);
      const { data } = await serviceClient().from("quiz_attempt_bests").select("score").eq("attempt_id", attemptA).single();
      expect(Number(data!.score)).toBe(1);
    });

    it("can't mark their best answers right", async () => {
      await studentA.from("quiz_attempt_best_answers").update({ is_correct: true, points_awarded: 10 }).eq("attempt_id", attemptA);
      const { data } = await serviceClient().from("quiz_attempt_best_answers").select("is_correct, points_awarded").eq("attempt_id", attemptA).single();
      expect(data).toEqual({ is_correct: false, points_awarded: 1 });
    });

    it("can't hand in an attempt with a score of their own choosing", async () => {
      await serviceClient().from("quiz_attempts").delete().eq("student_id", fixtures.studentB.id);
      // Student B has quizA's id from nowhere legitimate, but the point is the score.
      const { error } = await studentB
        .from("quiz_attempts")
        .insert({ quiz_id: fixtures.quizA.id, student_id: fixtures.studentB.id, score: 10, quiz_title: "x", max_score: 10 });
      const { count } = await serviceClient().from("quiz_attempts").select("id", { count: "exact", head: true }).eq("student_id", fixtures.studentB.id);
      expect({ rejected: error !== null, stored: count }).toEqual({ rejected: true, stored: 0 });
    });

    it("can't add answers marked right to their own attempt", async () => {
      const { error } = await studentA
        .from("quiz_attempt_answers")
        .insert({ attempt_id: attemptA, question_id: fixtures.questionA.id, text_answer: "4", is_correct: true, points_awarded: 10 });
      expect(error).not.toBeNull();
    });
  });

  describe("homework and class files", () => {
    it("reach the class's students and parents only", async () => {
      expect(await rowsSeenBy(studentA, "homework", "id", homeworkA)).toBe(1);
      expect(await rowsSeenBy(parentA1, "homework", "id", homeworkA)).toBe(1);
      expect(await rowsSeenBy(studentA, "class_files", "id", fileA)).toBe(1);
      expect(await rowsSeenBy(parentA1, "class_files", "id", fileA)).toBe(1);

      for (const client of [studentB, parentB1, anon]) {
        expect(await rowsSeenBy(client, "homework", "id", homeworkA)).toBe(0);
        expect(await rowsSeenBy(client, "class_files", "id", fileA)).toBe(0);
      }
      // ...and the other way round.
      expect(await rowsSeenBy(studentA, "homework", "id", homeworkB)).toBe(0);
      expect(await rowsSeenBy(parentA1, "class_files", "id", fileB)).toBe(0);
    });

    it("can't be written by students or parents", async () => {
      for (const client of [studentA, parentA1]) {
        const { error: homeworkError } = await client
          .from("homework")
          .insert({ teacher_id: fixtures.teacherA.id, class_id: fixtures.classA.id, note: "no homework this week" });
        expect(homeworkError).not.toBeNull();
        const { error: fileError } = await client
          .from("class_files")
          .insert({ teacher_id: fixtures.teacherA.id, class_id: fixtures.classA.id, kind: "link", title: "x", url: "https://example.test/x" });
        expect(fileError).not.toBeNull();
        await client.from("homework").delete().eq("id", homeworkA);
        await client.from("class_files").delete().eq("id", fileA);
      }
      expect(await rowsSeenBy(serviceClient() as typeof studentA, "homework", "id", homeworkA)).toBe(1);
      expect(await rowsSeenBy(serviceClient() as typeof studentA, "class_files", "id", fileA)).toBe(1);
    });
  });

  describe("attendance alerts", () => {
    it("are the teacher's only", async () => {
      expect(await rowsSeenBy(teacherA, "attendance_alerts", "class_id", fixtures.classA.id)).toBe(1);
      for (const client of [studentA, parentA1, anon]) {
        expect(await rowsSeenBy(client, "attendance_alerts", "class_id", fixtures.classA.id)).toBe(0);
      }
    });
  });
});

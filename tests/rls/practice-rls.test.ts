import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { signInAs, serviceClient } from "./helpers";
import { cleanupFixtures, createFixtures, type Fixtures } from "./fixtures";

/**
 * Practice (20261115125145_practice-pool.sql, 20261115162420_practice-progress.sql):
 * - The bank (sections, questions) is read only by the teacher who owns it;
 *   rounds are drawn by the server with the service role, so students,
 *   parents and guests get nothing directly - not even public sections, and
 *   never the answers.
 * - practice_progress / practice_answers: a student reads and writes only
 *   their own; parents read only their own children's.
 * - practice_reports: written by the server only; read by the teacher.
 */
describe("RLS: practice", () => {
  let fixtures: Fixtures;
  let teacherA: Awaited<ReturnType<typeof signInAs>>;
  let teacherB: Awaited<ReturnType<typeof signInAs>>;
  let parentA1: Awaited<ReturnType<typeof signInAs>>;
  let parentB1: Awaited<ReturnType<typeof signInAs>>;
  let studentA: Awaited<ReturnType<typeof signInAs>>;
  let studentB: Awaited<ReturnType<typeof signInAs>>;
  let anon: Awaited<ReturnType<typeof signInAs>>;
  let sectionId: string;
  let questionId: string;

  const progress = (points: number) => ({
    version: 1, points, bestScore: 0, daily: { count: 0, lastDay: null },
    mistakes: [], sections: {}, lastGrade: null, lastSections: [],
  });

  beforeAll(async () => {
    fixtures = await createFixtures();
    const admin = serviceClient();

    for (const [studentId, email] of [
      [fixtures.studentA.id, "rls-practice-student-a@example.test"],
      [fixtures.studentB.id, "rls-practice-student-b@example.test"],
    ]) {
      const { data } = await admin.auth.admin.createUser({ email, password: fixtures.password, email_confirm: true });
      await admin.from("students").update({ user_id: data.user!.id }).eq("id", studentId);
    }

    teacherA = await signInAs(fixtures.teacherA.email, fixtures.password);
    teacherB = await signInAs(fixtures.teacherB.email, fixtures.password);
    parentA1 = await signInAs(fixtures.parentA1.email, fixtures.password);
    parentB1 = await signInAs(fixtures.parentB1.email, fixtures.password);
    studentA = await signInAs("rls-practice-student-a@example.test", fixtures.password);
    studentB = await signInAs("rls-practice-student-b@example.test", fixtures.password);
    // No session: what a guest's browser could ask for.
    anon = createClient(process.env.LOCAL_SUPABASE_URL!, process.env.LOCAL_SUPABASE_ANON_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    }) as typeof studentA;

    // A public section with one question, as the teacher would make it.
    const { data: section, error: sectionError } = await teacherA
      .from("practice_sections")
      .insert({ teacher_id: fixtures.teacherA.id, grade: "lyk_b", name: "RLS practice", is_public: true })
      .select("id")
      .single();
    if (sectionError) throw sectionError;
    sectionId = section.id;
    const { data: question, error: questionError } = await teacherA
      .from("practice_questions")
      .insert({ teacher_id: fixtures.teacherA.id, section_id: sectionId, type: "number", prompt: "2 + 2 = ?", answer: "4" })
      .select("id")
      .single();
    if (questionError) throw questionError;
    questionId = question.id;
  }, 60000);

  afterAll(async () => {
    const admin = serviceClient();
    await admin.from("practice_reports").delete().eq("question_id", questionId);
    await admin.from("practice_answers").delete().in("student_id", [fixtures.studentA.id, fixtures.studentB.id]);
    await admin.from("practice_progress").delete().in("student_id", [fixtures.studentA.id, fixtures.studentB.id]);
    await admin.from("practice_sections").delete().eq("id", sectionId);
    await admin.from("students").update({ user_id: null }).in("id", [fixtures.studentA.id, fixtures.studentB.id]);
    const { data: users } = await admin.auth.admin.listUsers();
    for (const user of users.users.filter((u) => u.email?.startsWith("rls-practice-"))) {
      await admin.auth.admin.deleteUser(user.id);
    }
    await cleanupFixtures(fixtures);
  }, 60000);

  describe("the question bank", () => {
    it("is readable by the teacher who owns it", async () => {
      const { data } = await teacherA.from("practice_questions").select("id, answer").eq("id", questionId);
      expect(data).toEqual([{ id: questionId, answer: "4" }]);
    });

    it("gives students, parents, guests and another teacher nothing - not even a public section's answers", async () => {
      for (const client of [studentA, parentA1, anon, teacherB]) {
        const { data: sections } = await client.from("practice_sections").select("id").eq("id", sectionId);
        expect(sections ?? []).toEqual([]);
        const { data: questions } = await client.from("practice_questions").select("id, answer").eq("id", questionId);
        expect(questions ?? []).toEqual([]);
      }
    });

    it("can't be written by a student", async () => {
      const { error } = await studentA
        .from("practice_questions")
        .insert({ teacher_id: fixtures.teacherA.id, section_id: sectionId, type: "number", prompt: "1 + 1 = ?", answer: "2" });
      expect(error).not.toBeNull();
      const { data: changed } = await studentA.from("practice_questions").update({ answer: "5" }).eq("id", questionId).select("id");
      expect(changed ?? []).toEqual([]);
    });
  });

  describe("progress", () => {
    it("lets a student save and read their own", async () => {
      const { error } = await studentA.from("practice_progress").upsert({ student_id: fixtures.studentA.id, data: progress(120) });
      expect(error).toBeNull();
      const { data } = await studentA.from("practice_progress").select("student_id").eq("student_id", fixtures.studentA.id);
      expect(data).toHaveLength(1);
    });

    it("doesn't let a student read, write or overwrite another student's", async () => {
      await serviceClient().from("practice_progress").upsert({ student_id: fixtures.studentB.id, data: progress(5) });

      const { data: read } = await studentA.from("practice_progress").select("student_id").eq("student_id", fixtures.studentB.id);
      expect(read).toEqual([]);

      const { error: upsertError } = await studentA.from("practice_progress").upsert({ student_id: fixtures.studentB.id, data: progress(999999) });
      expect(upsertError).not.toBeNull();
      const { data: updated } = await studentA.from("practice_progress").update({ data: progress(999999) }).eq("student_id", fixtures.studentB.id).select("student_id");
      expect(updated ?? []).toEqual([]);

      const { data: stored } = await serviceClient().from("practice_progress").select("data").eq("student_id", fixtures.studentB.id).single();
      expect((stored!.data as { points: number }).points).toBe(5);
    });

    it("is visible to the child's parents only", async () => {
      const { data: own } = await parentA1.from("practice_progress").select("student_id").eq("student_id", fixtures.studentA.id);
      expect(own).toHaveLength(1);
      const { data: other } = await parentB1.from("practice_progress").select("student_id").eq("student_id", fixtures.studentA.id);
      expect(other).toEqual([]);
      // A parent can look, not change it (no update policy: the update matches no rows).
      await parentA1.from("practice_progress").update({ data: progress(0) }).eq("student_id", fixtures.studentA.id);
      const { data: stored } = await serviceClient().from("practice_progress").select("data").eq("student_id", fixtures.studentA.id).single();
      expect((stored!.data as { points: number }).points).toBe(120);
    });

    it("is hidden from guests", async () => {
      const { data } = await anon.from("practice_progress").select("student_id");
      expect(data ?? []).toEqual([]);
    });
  });

  describe("answers", () => {
    const answer = (studentId: string, clientId: string) => ({
      student_id: studentId, question_id: questionId, section_id: sectionId, correct: true, points: 10, client_id: clientId,
    });

    it("lets a student record their own, once per client id", async () => {
      const { error } = await studentA.from("practice_answers").insert(answer(fixtures.studentA.id, "rls-answer-0001"));
      expect(error).toBeNull();
      const { error: again } = await studentA.from("practice_answers").insert(answer(fixtures.studentA.id, "rls-answer-0001"));
      expect(again).not.toBeNull();
    });

    it("doesn't let a student record answers as someone else", async () => {
      const { error } = await studentA.from("practice_answers").insert(answer(fixtures.studentB.id, "rls-answer-0002"));
      expect(error).not.toBeNull();
    });

    it("doesn't let a student change or delete answers already recorded", async () => {
      const { data: updated } = await studentA.from("practice_answers").update({ correct: false }).eq("student_id", fixtures.studentA.id).select("id");
      expect(updated ?? []).toEqual([]);
      await studentA.from("practice_answers").delete().eq("student_id", fixtures.studentA.id);
      const { count } = await serviceClient().from("practice_answers").select("id", { count: "exact", head: true }).eq("student_id", fixtures.studentA.id);
      expect(count).toBe(1);
    });

    it("are visible to the student, their parents and the teacher, and nobody else", async () => {
      const visible = async (client: typeof studentA) =>
        ((await client.from("practice_answers").select("id").eq("student_id", fixtures.studentA.id)).data ?? []).length;
      expect(await visible(studentA)).toBe(1);
      expect(await visible(parentA1)).toBe(1);
      expect(await visible(teacherA)).toBe(1);
      expect(await visible(studentB)).toBe(0);
      expect(await visible(parentB1)).toBe(0);
      expect(await visible(anon)).toBe(0);
    });
  });

  describe("reports", () => {
    it("can't be written directly by a student or a guest (the server does it, rate-limited)", async () => {
      for (const client of [studentA, anon]) {
        const { error } = await client.from("practice_reports").insert({ question_id: questionId, message: "spam" });
        expect(error).not.toBeNull();
      }
    });

    it("are read by the teacher, not by students or parents", async () => {
      await serviceClient().from("practice_reports").insert({ question_id: questionId, student_id: fixtures.studentA.id, message: "Typo" });
      const { data: forTeacher } = await teacherA.from("practice_reports").select("message").eq("question_id", questionId);
      expect(forTeacher).toEqual([{ message: "Typo" }]);
      for (const client of [studentA, parentA1]) {
        const { data } = await client.from("practice_reports").select("id").eq("question_id", questionId);
        expect(data ?? []).toEqual([]);
      }
    });
  });
});

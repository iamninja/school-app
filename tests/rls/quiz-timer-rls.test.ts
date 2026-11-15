import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { signInAs, serviceClient } from "./helpers";
import { cleanupFixtures, createFixtures, type Fixtures } from "./fixtures";

/**
 * The quiz timer and closed questions (20261115213340_quiz-timer-server-side.sql):
 * - the timer's start time (quiz_attempt_starts) is written by the server
 *   only, so a student can't restart their own timer;
 * - a quiz's questions and options are hidden from a student until they
 *   start it (or have handed it in), and from a parent until their child
 *   has handed it in;
 * - quiz_max_scores gives the portals each quiz's total points without
 *   the questions.
 *
 * quizA (teacher A) is assigned to classA; studentA is in classA.
 */
describe("RLS: quiz timer and closed questions", () => {
  let fixtures: Fixtures;
  let parentA1: Awaited<ReturnType<typeof signInAs>>;
  let parentB1: Awaited<ReturnType<typeof signInAs>>;
  let studentA: Awaited<ReturnType<typeof signInAs>>;
  let studentB: Awaited<ReturnType<typeof signInAs>>;
  let anon: Awaited<ReturnType<typeof signInAs>>;
  let optionId: string;

  const questionsSeenBy = async (client: typeof studentA) =>
    ((await client.from("quiz_questions").select("id, question_text").eq("quiz_id", fixtures.quizA.id)).data ?? []).length;
  const optionsSeenBy = async (client: typeof studentA) =>
    ((await client.from("quiz_question_options").select("id, option_text").eq("id", optionId)).data ?? []).length;
  const startedAt = async () =>
    (await serviceClient().from("quiz_attempt_starts").select("started_at").eq("quiz_id", fixtures.quizA.id).eq("student_id", fixtures.studentA.id).maybeSingle()).data?.started_at ?? null;

  beforeAll(async () => {
    fixtures = await createFixtures();
    const admin = serviceClient();
    for (const [studentId, email] of [
      [fixtures.studentA.id, "rls-quiz-timer-a@example.test"],
      [fixtures.studentB.id, "rls-quiz-timer-b@example.test"],
    ]) {
      const { data } = await admin.auth.admin.createUser({ email, password: fixtures.password, email_confirm: true });
      await admin.from("students").update({ user_id: data.user!.id }).eq("id", studentId);
    }
    await admin.from("quizzes").update({ time_limit_minutes: 20 }).eq("id", fixtures.quizA.id);
    await admin.from("quiz_questions").update({ points: 4 }).eq("id", fixtures.questionA.id);
    const { data: option } = await admin
      .from("quiz_question_options")
      .insert({ question_id: fixtures.questionA.id, option_text: "4", is_correct: true, order_index: 0 })
      .select("id")
      .single();
    optionId = option!.id;

    parentA1 = await signInAs(fixtures.parentA1.email, fixtures.password);
    parentB1 = await signInAs(fixtures.parentB1.email, fixtures.password);
    studentA = await signInAs("rls-quiz-timer-a@example.test", fixtures.password);
    studentB = await signInAs("rls-quiz-timer-b@example.test", fixtures.password);
    anon = createClient(process.env.LOCAL_SUPABASE_URL!, process.env.LOCAL_SUPABASE_ANON_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    }) as typeof studentA;
  }, 60000);

  afterAll(async () => {
    const admin = serviceClient();
    await admin.from("quiz_attempt_starts").delete().eq("quiz_id", fixtures.quizA.id);
    const { data: attempts } = await admin.from("quiz_attempts").select("id").eq("quiz_id", fixtures.quizA.id);
    const ids = (attempts ?? []).map((row) => row.id);
    await admin.from("quiz_attempt_bests").delete().in("attempt_id", ids);
    await admin.from("quiz_attempts").delete().in("id", ids);
    await admin.from("quiz_question_options").delete().eq("id", optionId);
    await admin.from("students").update({ user_id: null }).in("id", [fixtures.studentA.id, fixtures.studentB.id]);
    const { data: users } = await admin.auth.admin.listUsers();
    for (const user of users.users.filter((u) => u.email?.startsWith("rls-quiz-timer-"))) {
      await admin.auth.admin.deleteUser(user.id);
    }
    await cleanupFixtures(fixtures);
  }, 60000);

  it("shows an assigned quiz's title but not its questions or options before it's started", async () => {
    const { data: quiz } = await studentA.from("quizzes").select("id, title").eq("id", fixtures.quizA.id);
    expect(quiz).toHaveLength(1);
    expect(await questionsSeenBy(studentA)).toBe(0);
    expect(await optionsSeenBy(studentA)).toBe(0);
    expect(await questionsSeenBy(parentA1)).toBe(0);
  });

  it("gives the portals each quiz's total points, only for their own quizzes", async () => {
    for (const client of [studentA, parentA1]) {
      const { data, error } = await client.rpc("quiz_max_scores", { quiz_ids: [fixtures.quizA.id] });
      expect(error).toBeNull();
      expect(data).toEqual([{ quiz_id: fixtures.quizA.id, max_score: 4 }]);
    }
    for (const client of [studentB, parentB1]) {
      const { data } = await client.rpc("quiz_max_scores", { quiz_ids: [fixtures.quizA.id] });
      expect(data ?? []).toEqual([]);
    }
    const { error } = await anon.rpc("quiz_max_scores", { quiz_ids: [fixtures.quizA.id] });
    expect(error).not.toBeNull();
  });

  it("doesn't let a student start, restart or stop their own timer", async () => {
    const { error: insertError } = await studentA
      .from("quiz_attempt_starts")
      .insert({ quiz_id: fixtures.quizA.id, student_id: fixtures.studentA.id });
    expect(insertError).not.toBeNull();
    expect(await startedAt()).toBeNull();

    // Started by the server (getQuizForTakingAction), 15 minutes ago.
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60_000).toISOString();
    await serviceClient().from("quiz_attempt_starts").insert({ quiz_id: fixtures.quizA.id, student_id: fixtures.studentA.id, started_at: fifteenMinutesAgo });

    await studentA.from("quiz_attempt_starts").update({ started_at: new Date().toISOString() }).eq("quiz_id", fixtures.quizA.id);
    await studentA.from("quiz_attempt_starts").delete().eq("quiz_id", fixtures.quizA.id);
    expect(Date.parse((await startedAt())!)).toBe(Date.parse(fifteenMinutesAgo));

    // The student can still read their own start time (the countdown).
    const { data: own } = await studentA.from("quiz_attempt_starts").select("started_at").eq("quiz_id", fixtures.quizA.id);
    expect(own).toHaveLength(1);
  });

  it("opens the questions to the student once started - not to their parents or anyone else", async () => {
    expect(await questionsSeenBy(studentA)).toBe(1);
    expect(await optionsSeenBy(studentA)).toBe(1);
    for (const client of [parentA1, studentB, parentB1, anon]) {
      expect(await questionsSeenBy(client)).toBe(0);
      expect(await optionsSeenBy(client)).toBe(0);
    }
  });

  it("keeps the questions open after hand-in, and opens them to the parents then", async () => {
    const admin = serviceClient();
    await admin.from("quiz_attempts").insert({ quiz_id: fixtures.quizA.id, student_id: fixtures.studentA.id, score: 4, quiz_title: "RLS Test Quiz A", max_score: 4 });
    await admin.from("quiz_attempt_starts").delete().eq("quiz_id", fixtures.quizA.id);

    expect(await questionsSeenBy(studentA)).toBe(1);
    expect(await questionsSeenBy(parentA1)).toBe(1);
    expect(await questionsSeenBy(parentB1)).toBe(0);
    expect(await questionsSeenBy(studentB)).toBe(0);
  });

  it("keeps how late a quiz was handed in where the student can read it but not change it", async () => {
    const admin = serviceClient();
    await admin.from("quiz_attempts").update({ late_by_seconds: 2400 }).eq("quiz_id", fixtures.quizA.id);
    const { data: own } = await studentA.from("quiz_attempts").select("late_by_seconds").eq("quiz_id", fixtures.quizA.id).single();
    expect(own).toEqual({ late_by_seconds: 2400 });
    await studentA.from("quiz_attempts").update({ late_by_seconds: null }).eq("quiz_id", fixtures.quizA.id);
    const { data: stored } = await admin.from("quiz_attempts").select("late_by_seconds").eq("quiz_id", fixtures.quizA.id).single();
    expect(stored).toEqual({ late_by_seconds: 2400 });
  });
});

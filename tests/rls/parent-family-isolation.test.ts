import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { signInAs } from "./helpers";
import { cleanupFixtures, createFixtures, type Fixtures } from "./fixtures";

describe("RLS: parent/family isolation", () => {
  let fixtures: Fixtures;
  let parentA1: Awaited<ReturnType<typeof signInAs>>;
  let parentB1: Awaited<ReturnType<typeof signInAs>>;
  let teacherA: Awaited<ReturnType<typeof signInAs>>;

  beforeAll(async () => {
    fixtures = await createFixtures();
    parentA1 = await signInAs(fixtures.parentA1.email, fixtures.password);
    parentB1 = await signInAs(fixtures.parentB1.email, fixtures.password);
    teacherA = await signInAs(fixtures.teacherA.email, fixtures.password);
  }, 30000);

  afterAll(async () => {
    await cleanupFixtures(fixtures);
  }, 30000);

  it("lets a parent see their own child", async () => {
    const { data } = await parentA1
      .from("students")
      .select("id")
      .eq("id", fixtures.studentA.id);
    expect(data).toHaveLength(1);
  });

  it("does not let a parent see another family's child", async () => {
    const { data } = await parentA1
      .from("students")
      .select("id")
      .eq("id", fixtures.studentB.id);
    expect(data).toHaveLength(0);
  });

  it("lets a parent see the other parent in their own family", async () => {
    const { data } = await parentA1
      .from("family_parents")
      .select("id")
      .eq("family_id", fixtures.familyA.id);
    expect(data).toHaveLength(2);
  });

  it("lets a parent see quiz questions for their child's assigned quiz, but not an unrelated family's", async () => {
    const ownFamily = await parentA1
      .from("quiz_questions")
      .select("id")
      .eq("id", fixtures.questionA.id);
    expect(ownFamily.data).toHaveLength(1);

    const otherFamily = await parentB1
      .from("quiz_questions")
      .select("id")
      .eq("id", fixtures.questionA.id);
    expect(otherFamily.data).toHaveLength(0);
  });

  it("does not let a teacher see another teacher's student", async () => {
    const ownStudent = await teacherA
      .from("students")
      .select("id")
      .eq("id", fixtures.studentA.id);
    expect(ownStudent.data).toHaveLength(1);

    const otherStudent = await teacherA
      .from("students")
      .select("id")
      .eq("id", fixtures.studentB.id);
    expect(otherStudent.data).toHaveLength(0);
  });
});

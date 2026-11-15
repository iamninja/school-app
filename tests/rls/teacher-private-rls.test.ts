import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { signInAs, serviceClient } from "./helpers";
import { cleanupFixtures, createFixtures, type Fixtures } from "./fixtures";

/**
 * The teacher's own records - contacts (with phone numbers), tasks and
 * expenses - are nobody else's: not a parent's, not a student's, not a
 * guest's. Contacts and tasks are also per teacher.
 */
describe("RLS: teacher-only data", () => {
  let fixtures: Fixtures;
  let teacherA: Awaited<ReturnType<typeof signInAs>>;
  let teacherB: Awaited<ReturnType<typeof signInAs>>;
  let parentA1: Awaited<ReturnType<typeof signInAs>>;
  let studentA: Awaited<ReturnType<typeof signInAs>>;
  let anon: Awaited<ReturnType<typeof signInAs>>;
  let contactId: string;
  let taskId: string;
  let expenseId: string;

  const visible = async (client: typeof teacherA, table: string, id: string) =>
    ((await client.from(table).select("id").eq("id", id)).data ?? []).length;

  beforeAll(async () => {
    fixtures = await createFixtures();
    const admin = serviceClient();
    const { data } = await admin.auth.admin.createUser({ email: "rls-teacher-private-student@example.test", password: fixtures.password, email_confirm: true });
    await admin.from("students").update({ user_id: data.user!.id }).eq("id", fixtures.studentA.id);

    teacherA = await signInAs(fixtures.teacherA.email, fixtures.password);
    teacherB = await signInAs(fixtures.teacherB.email, fixtures.password);
    parentA1 = await signInAs(fixtures.parentA1.email, fixtures.password);
    studentA = await signInAs("rls-teacher-private-student@example.test", fixtures.password);
    anon = createClient(process.env.LOCAL_SUPABASE_URL!, process.env.LOCAL_SUPABASE_ANON_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    }) as typeof teacherA;

    // Written through the teacher's own session, as the console does.
    const contact = await teacherA.from("teacher_contacts").insert({ teacher_id: fixtures.teacherA.id, name: "Λογιστής", phone: "+306900000000" }).select("id").single();
    if (contact.error) throw contact.error;
    contactId = contact.data.id;
    const task = await teacherA.from("teacher_tasks").insert({ teacher_id: fixtures.teacherA.id, kind: "personal", title: "Call the accountant" }).select("id").single();
    if (task.error) throw task.error;
    taskId = task.data.id;
    const expense = await teacherA.from("expenses").insert({ supplier_name: "Χαρτικά ΑΕ", description: "Paper", amount: 12.5 }).select("id").single();
    if (expense.error) throw expense.error;
    expenseId = expense.data.id;
  }, 60000);

  afterAll(async () => {
    const admin = serviceClient();
    await admin.from("teacher_contacts").delete().eq("id", contactId);
    await admin.from("teacher_tasks").delete().eq("id", taskId);
    await admin.from("expenses").delete().eq("id", expenseId);
    await admin.from("students").update({ user_id: null }).eq("id", fixtures.studentA.id);
    const { data: users } = await admin.auth.admin.listUsers();
    for (const user of users.users.filter((u) => u.email?.startsWith("rls-teacher-private-"))) {
      await admin.auth.admin.deleteUser(user.id);
    }
    await cleanupFixtures(fixtures);
  }, 60000);

  it("lets the teacher see their own contacts, tasks and expenses", async () => {
    expect(await visible(teacherA, "teacher_contacts", contactId)).toBe(1);
    expect(await visible(teacherA, "teacher_tasks", taskId)).toBe(1);
    expect(await visible(teacherA, "expenses", expenseId)).toBe(1);
  });

  it("hides them from parents, students and guests", async () => {
    for (const client of [parentA1, studentA, anon]) {
      expect(await visible(client, "teacher_contacts", contactId)).toBe(0);
      expect(await visible(client, "teacher_tasks", taskId)).toBe(0);
      expect(await visible(client, "expenses", expenseId)).toBe(0);
    }
  });

  it("keeps contacts and tasks per teacher", async () => {
    expect(await visible(teacherB, "teacher_contacts", contactId)).toBe(0);
    expect(await visible(teacherB, "teacher_tasks", taskId)).toBe(0);
  });

  it("doesn't let parents, students or guests add, change or delete them", async () => {
    for (const client of [parentA1, studentA, anon]) {
      const inserts = await Promise.all([
        client.from("teacher_contacts").insert({ teacher_id: fixtures.teacherA.id, name: "x" }),
        client.from("teacher_tasks").insert({ teacher_id: fixtures.teacherA.id, kind: "personal", title: "x" }),
        client.from("expenses").insert({ supplier_name: "x", description: "x", amount: 1 }),
      ]);
      for (const { error } of inserts) expect(error).not.toBeNull();
      await client.from("teacher_contacts").update({ phone: "+301111111111" }).eq("id", contactId);
      await client.from("expenses").update({ amount: 0 }).eq("id", expenseId);
      await client.from("teacher_tasks").delete().eq("id", taskId);
    }
    const admin = serviceClient();
    expect((await admin.from("teacher_contacts").select("phone").eq("id", contactId).single()).data).toEqual({ phone: "+306900000000" });
    expect(Number((await admin.from("expenses").select("amount").eq("id", expenseId).single()).data!.amount)).toBe(12.5);
    expect((await admin.from("teacher_tasks").select("id").eq("id", taskId)).data).toHaveLength(1);
  });
});

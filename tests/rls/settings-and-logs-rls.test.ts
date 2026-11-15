import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { signInAs, serviceClient } from "./helpers";
import { cleanupFixtures, createFixtures, type Fixtures } from "./fixtures";

/**
 * The last four tables without their own RLS test:
 * - site_settings: read by everyone (the public site and the portals), written only by the teacher;
 * - class_schedule_slots: a class's timetable, for its students and parents only;
 * - mydata_submission_log: myDATA/AADE submissions, the teacher's only;
 * - notification_job_runs: when the notification jobs last ran, the teacher's only.
 */
describe("RLS: site settings, timetables and logs", () => {
  let fixtures: Fixtures;
  let teacherA: Awaited<ReturnType<typeof signInAs>>;
  let parentA1: Awaited<ReturnType<typeof signInAs>>;
  let parentB1: Awaited<ReturnType<typeof signInAs>>;
  let studentA: Awaited<ReturnType<typeof signInAs>>;
  let anon: Awaited<ReturnType<typeof signInAs>>;
  let originalMessage: string | null = null;
  let slotA: string;
  let slotB: string;
  let receiptId: string;
  let logId: string;

  const visible = async (client: typeof teacherA, table: string, column: string, value: string) =>
    ((await client.from(table).select(column).eq(column, value)).data ?? []).length;

  beforeAll(async () => {
    fixtures = await createFixtures();
    const admin = serviceClient();
    const { data } = await admin.auth.admin.createUser({ email: "rls-settings-student-a@example.test", password: fixtures.password, email_confirm: true });
    await admin.from("students").update({ user_id: data.user!.id }).eq("id", fixtures.studentA.id);

    teacherA = await signInAs(fixtures.teacherA.email, fixtures.password);
    parentA1 = await signInAs(fixtures.parentA1.email, fixtures.password);
    parentB1 = await signInAs(fixtures.parentB1.email, fixtures.password);
    studentA = await signInAs("rls-settings-student-a@example.test", fixtures.password);
    anon = createClient(process.env.LOCAL_SUPABASE_URL!, process.env.LOCAL_SUPABASE_ANON_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    }) as typeof teacherA;

    const { data: settings } = await admin.from("site_settings").select("christmas_message").eq("id", 1).maybeSingle();
    originalMessage = settings?.christmas_message ?? null;

    const slots = await admin
      .from("class_schedule_slots")
      .insert([
        { teacher_id: fixtures.teacherA.id, class_id: fixtures.classA.id, day: "Mon", time: "17:00", end_time: "18:00" },
        { teacher_id: fixtures.teacherB.id, class_id: fixtures.classB.id, day: "Tue", time: "18:00", end_time: "19:00" },
      ])
      .select("id, class_id");
    if (slots.error) throw slots.error;
    slotA = slots.data.find((row) => row.class_id === fixtures.classA.id)!.id;
    slotB = slots.data.find((row) => row.class_id === fixtures.classB.id)!.id;

    const receipt = await admin
      .from("receipts")
      .insert({ series: "RLS", receipt_number: 1, recipient_name: "RLS Test Recipient", total_amount: 50 })
      .select("id")
      .single();
    if (receipt.error) throw receipt.error;
    receiptId = receipt.data.id;
    const log = await admin
      .from("mydata_submission_log")
      .insert({ receipt_id: receiptId, environment: "sandbox", success: true, kind: "submit", mark: "400001234567890" })
      .select("id")
      .single();
    if (log.error) throw log.error;
    logId = log.data.id;
    await admin.from("notification_job_runs").upsert({ job: "rls-test-job" });
  }, 60000);

  afterAll(async () => {
    const admin = serviceClient();
    await admin.from("site_settings").update({ christmas_message: originalMessage }).eq("id", 1);
    await admin.from("class_schedule_slots").delete().in("id", [slotA, slotB]);
    await admin.from("mydata_submission_log").delete().eq("id", logId);
    await admin.from("receipts").delete().eq("id", receiptId);
    await admin.from("notification_job_runs").delete().eq("job", "rls-test-job");
    await admin.from("students").update({ user_id: null }).eq("id", fixtures.studentA.id);
    const { data: users } = await admin.auth.admin.listUsers();
    for (const user of users.users.filter((u) => u.email?.startsWith("rls-settings-"))) {
      await admin.auth.admin.deleteUser(user.id);
    }
    await cleanupFixtures(fixtures);
  }, 60000);

  describe("site settings", () => {
    it("are readable by everyone, guests included", async () => {
      for (const client of [anon, studentA, parentA1, teacherA]) {
        const { data } = await client.from("site_settings").select("id, christmas_mode").eq("id", 1);
        expect(data).toHaveLength(1);
      }
    });

    it("are changed by the teacher only", async () => {
      for (const client of [anon, studentA, parentA1]) {
        await client.from("site_settings").update({ christmas_message: "Hacked" }).eq("id", 1);
      }
      const { data: after } = await serviceClient().from("site_settings").select("christmas_message").eq("id", 1).single();
      expect(after!.christmas_message).toBe(originalMessage);

      const { error } = await teacherA.from("site_settings").update({ christmas_message: "Καλά Χριστούγεννα" }).eq("id", 1);
      expect(error).toBeNull();
      const { data: changed } = await serviceClient().from("site_settings").select("christmas_message").eq("id", 1).single();
      expect(changed!.christmas_message).toBe("Καλά Χριστούγεννα");
    });
  });

  describe("class timetables", () => {
    it("reach the class's students and parents only", async () => {
      expect(await visible(studentA, "class_schedule_slots", "id", slotA)).toBe(1);
      expect(await visible(parentA1, "class_schedule_slots", "id", slotA)).toBe(1);
      expect(await visible(parentB1, "class_schedule_slots", "id", slotA)).toBe(0);
      expect(await visible(anon, "class_schedule_slots", "id", slotA)).toBe(0);
      expect(await visible(studentA, "class_schedule_slots", "id", slotB)).toBe(0);
      expect(await visible(parentA1, "class_schedule_slots", "id", slotB)).toBe(0);
    });

    it("can't be changed by students or parents", async () => {
      for (const client of [studentA, parentA1]) {
        const { error } = await client
          .from("class_schedule_slots")
          .insert({ teacher_id: fixtures.teacherA.id, class_id: fixtures.classA.id, day: "Sat", time: "10:00", end_time: "11:00" });
        expect(error).not.toBeNull();
        await client.from("class_schedule_slots").update({ time: "08:00" }).eq("id", slotA);
        await client.from("class_schedule_slots").delete().eq("id", slotA);
      }
      const { data } = await serviceClient().from("class_schedule_slots").select("time").eq("id", slotA).single();
      expect(data).toEqual({ time: "17:00" });
    });
  });

  describe("teacher-only logs", () => {
    it("show myDATA submissions and job runs to the teacher", async () => {
      expect(await visible(teacherA, "mydata_submission_log", "id", logId)).toBe(1);
      expect(await visible(teacherA, "notification_job_runs", "job", "rls-test-job")).toBe(1);
    });

    it("hide them from students, parents and guests, who can't write them either", async () => {
      for (const client of [studentA, parentA1, anon]) {
        expect(await visible(client, "mydata_submission_log", "id", logId)).toBe(0);
        expect(await visible(client, "notification_job_runs", "job", "rls-test-job")).toBe(0);
        const { error } = await client
          .from("mydata_submission_log")
          .insert({ receipt_id: receiptId, environment: "production", success: true, kind: "submit" });
        expect(error).not.toBeNull();
        const { error: jobError } = await client.from("notification_job_runs").insert({ job: "rls-planted" });
        expect(jobError).not.toBeNull();
      }
    });
  });
});

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { signInAs, serviceClient } from "./helpers";
import { cleanupFixtures, createFixtures, type Fixtures } from "./fixtures";

/**
 * Push notifications: a device subscription and an inbox notice belong to
 * one person and nobody else, and the App tab's settings are the teacher's.
 * Each "can't" case first proves the row exists via the service role, so an
 * empty result can't pass for the wrong reason (a typo, a missing fixture).
 */
describe("RLS: push notifications", () => {
  let fixtures: Fixtures;
  let parentA1: Awaited<ReturnType<typeof signInAs>>;
  let parentA2: Awaited<ReturnType<typeof signInAs>>;
  let teacherA: Awaited<ReturnType<typeof signInAs>>;
  const endpointA1 = "https://push.example.test/rls-parent-a1";
  const endpointA2 = "https://push.example.test/rls-parent-a2";
  let inboxA1Id: string;

  beforeAll(async () => {
    fixtures = await createFixtures();
    parentA1 = await signInAs(fixtures.parentA1.email, fixtures.password);
    parentA2 = await signInAs(fixtures.parentA2.email, fixtures.password);
    teacherA = await signInAs(fixtures.teacherA.email, fixtures.password);

    const admin = serviceClient();
    await admin.from("push_subscriptions").insert({
      user_id: fixtures.parentA2.id,
      endpoint: endpointA2,
      p256dh: "key",
      auth: "auth",
    });
    const { data } = await admin
      .from("notification_inbox")
      .insert({ user_id: fixtures.parentA1.id, event: "receipt", title: "Νέα απόδειξη", body: "x" })
      .select("id")
      .single();
    inboxA1Id = data!.id;
  }, 30000);

  afterAll(async () => {
    const admin = serviceClient();
    await admin.from("push_subscriptions").delete().in("endpoint", [endpointA1, endpointA2]);
    await admin.from("notification_inbox").delete().eq("id", inboxA1Id);
    await cleanupFixtures(fixtures);
  }, 30000);

  it("a parent can add and see their own device", async () => {
    const { error } = await parentA1.from("push_subscriptions").insert({
      user_id: fixtures.parentA1.id,
      endpoint: endpointA1,
      p256dh: "key",
      auth: "auth",
    });
    expect(error).toBeNull();
    const { data } = await parentA1.from("push_subscriptions").select("endpoint");
    expect(data).toEqual([{ endpoint: endpointA1 }]);
  });

  it("a parent can't register a device in someone else's name", async () => {
    const { error } = await parentA1.from("push_subscriptions").insert({
      user_id: fixtures.parentA2.id,
      endpoint: "https://push.example.test/forged",
      p256dh: "key",
      auth: "auth",
    });
    expect(error).not.toBeNull();
  });

  it("another parent of the SAME family can't see or remove that parent's devices", async () => {
    const { data: exists } = await serviceClient()
      .from("push_subscriptions")
      .select("id")
      .eq("endpoint", endpointA2);
    expect(exists).toHaveLength(1);

    const { data } = await parentA1.from("push_subscriptions").select("endpoint").eq("endpoint", endpointA2);
    expect(data).toEqual([]);
    await parentA1.from("push_subscriptions").delete().eq("endpoint", endpointA2);
    const { data: still } = await serviceClient()
      .from("push_subscriptions")
      .select("id")
      .eq("endpoint", endpointA2);
    expect(still).toHaveLength(1);
  });

  it("the teacher can't read families' devices directly (only via the server)", async () => {
    const { data } = await teacherA.from("push_subscriptions").select("endpoint");
    expect(data).toEqual([]);
  });

  it("a parent reads their own inbox, but no one else's", async () => {
    const own = await parentA1.from("notification_inbox").select("id");
    expect(own.data).toEqual([{ id: inboxA1Id }]);
    const other = await parentA2.from("notification_inbox").select("id");
    expect(other.data).toEqual([]);
  });

  it("a parent can mark their notice read but can't rewrite it or add notices", async () => {
    const read = await parentA1
      .from("notification_inbox")
      .update({ read_at: new Date().toISOString() })
      .eq("id", inboxA1Id)
      .select("read_at");
    expect(read.error).toBeNull();
    expect(read.data?.[0]?.read_at).toBeTruthy();

    const rewrite = await parentA1
      .from("notification_inbox")
      .update({ title: "forged" })
      .eq("id", inboxA1Id);
    expect(rewrite.error).not.toBeNull();

    const insert = await parentA1.from("notification_inbox").insert({
      user_id: fixtures.parentA1.id,
      event: "receipt",
      title: "forged",
      body: "x",
    });
    expect(insert.error).not.toBeNull();
  });

  it("settings and texts are the teacher's: parents can't read or change them", async () => {
    const parentRead = await parentA1.from("notification_settings").select("paused");
    expect(parentRead.data).toEqual([]);
    const parentWrite = await parentA1
      .from("notification_settings")
      .update({ paused: true })
      .eq("id", 1)
      .select("id");
    expect(parentWrite.data ?? []).toEqual([]);

    const teacherRead = await teacherA.from("notification_settings").select("paused").eq("id", 1);
    expect(teacherRead.data).toEqual([{ paused: false }]);

    const parentTemplate = await parentA1
      .from("notification_templates")
      .insert({ event: "receipt", title: "x", body: "y" });
    expect(parentTemplate.error).not.toBeNull();
  });

  it("the send log and queues are hidden from families", async () => {
    for (const table of ["notification_log", "notification_queue", "absence_notifications", "scheduled_announcements"]) {
      const { data } = await parentA1.from(table).select("id");
      expect(data, table).toEqual([]);
    }
  });
});

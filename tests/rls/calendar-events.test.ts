import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { signInAs, serviceClient } from "./helpers";
import { cleanupFixtures, createFixtures, type Fixtures } from "./fixtures";

/**
 * calendar_events is a discriminated table (cancellation/extra_session/
 * ad_hoc_lesson/trial_lesson/block) whose RLS design deliberately has no
 * event_type branching - trial_lesson/block rows have both class_id and
 * student_id NULL, and a column compared to a NULL parameter is false in
 * Postgres, so the existing is_parent_of_class/is_parent_of_student/
 * is_student_of_class helpers exclude them by construction. That's the
 * single most important thing to prove here, not just trust by inspection.
 *
 * Also proves the CHECK-constraint-vs-ON-DELETE-SET-NULL fix directly: the
 * shape check is written against snapshot columns specifically so that
 * `delete from classes` (an unguarded, deliberate operation elsewhere in
 * this app) doesn't fail when a cancellation still references it.
 */
describe("RLS: calendar events", () => {
  let fixtures: Fixtures;
  let teacherA: Awaited<ReturnType<typeof signInAs>>;
  let teacherB: Awaited<ReturnType<typeof signInAs>>;
  let parentA1: Awaited<ReturnType<typeof signInAs>>;
  let parentB1: Awaited<ReturnType<typeof signInAs>>;
  let studentA: Awaited<ReturnType<typeof signInAs>>;
  const createdEventIds: string[] = [];
  const STUDENT_A_EMAIL = "rls-calendar-student-a@example.test";

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
    if (createdEventIds.length > 0) {
      await serviceClient()
        .from("calendar_events")
        .delete()
        .in("id", createdEventIds);
      createdEventIds.length = 0;
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

  it("lets a teacher create and read their own calendar events", async () => {
    const { data, error } = await teacherA
      .from("calendar_events")
      .insert({
        teacher_id: fixtures.teacherA.id,
        event_type: "cancellation",
        event_date: "2026-09-01",
        class_id: fixtures.classA.id,
        class_name: "RLS Test Class A",
      })
      .select("id")
      .single();

    expect(error).toBeNull();
    if (data) createdEventIds.push(data.id);
  });

  it("blocks a teacher from reading another teacher's calendar events", async () => {
    const admin = serviceClient();
    const { data: created } = await admin
      .from("calendar_events")
      .insert({
        teacher_id: fixtures.teacherA.id,
        event_type: "block",
        event_date: "2026-09-02",
        title: "Private note",
      })
      .select("id")
      .single();
    if (created) createdEventIds.push(created.id);

    const { data } = await teacherB.from("calendar_events").select("id");
    expect(data ?? []).toHaveLength(0);
  });

  it("blocks a parent from writing calendar events", async () => {
    const { error } = await parentA1.from("calendar_events").insert({
      teacher_id: fixtures.teacherA.id,
      event_type: "block",
      event_date: "2026-09-03",
      title: "Should not be allowed",
    });
    expect(error).not.toBeNull();
  });

  it("lets a parent see a cancellation and an extra session for their child's class", async () => {
    const admin = serviceClient();
    const { data: created } = await admin
      .from("calendar_events")
      .insert([
        {
          teacher_id: fixtures.teacherA.id,
          event_type: "cancellation",
          event_date: "2026-09-04",
          class_id: fixtures.classA.id,
          class_name: "RLS Test Class A",
        },
        {
          teacher_id: fixtures.teacherA.id,
          event_type: "extra_session",
          event_date: "2026-09-05",
          start_time: "17:00",
          class_id: fixtures.classA.id,
          class_name: "RLS Test Class A",
        },
      ])
      .select("id");
    for (const row of created ?? []) createdEventIds.push(row.id);

    const { data } = await parentA1
      .from("calendar_events")
      .select("event_type")
      .in("id", (created ?? []).map((row) => row.id));

    expect(data?.map((row) => row.event_type).sort()).toEqual([
      "cancellation",
      "extra_session",
    ]);
  });

  it("lets a parent see an ad_hoc_lesson for their own child", async () => {
    const admin = serviceClient();
    const { data: created } = await admin
      .from("calendar_events")
      .insert({
        teacher_id: fixtures.teacherA.id,
        event_type: "ad_hoc_lesson",
        event_date: "2026-09-06",
        start_time: "18:00",
        student_id: fixtures.studentA.id,
        student_name: "Student A",
      })
      .select("id")
      .single();
    if (created) createdEventIds.push(created.id);

    const { data } = await parentA1
      .from("calendar_events")
      .select("id")
      .eq("id", created!.id);
    expect(data).toHaveLength(1);
  });

  it("never lets a parent see a trial_lesson or a block, even one on their own child's class date", async () => {
    const admin = serviceClient();
    const { data: created } = await admin
      .from("calendar_events")
      .insert([
        {
          teacher_id: fixtures.teacherA.id,
          event_type: "trial_lesson",
          event_date: "2026-09-07",
          start_time: "10:00",
          contact_name: "Prospective Person",
        },
        {
          teacher_id: fixtures.teacherA.id,
          event_type: "block",
          event_date: "2026-09-07",
          title: "Dentist",
        },
      ])
      .select("id");
    for (const row of created ?? []) createdEventIds.push(row.id);

    const { data } = await parentA1
      .from("calendar_events")
      .select("id")
      .in("id", (created ?? []).map((row) => row.id));
    expect(data ?? []).toHaveLength(0);
  });

  it("blocks a parent from a different family from seeing any of teacher A's events", async () => {
    const admin = serviceClient();
    const { data: created } = await admin
      .from("calendar_events")
      .insert({
        teacher_id: fixtures.teacherA.id,
        event_type: "cancellation",
        event_date: "2026-09-08",
        class_id: fixtures.classA.id,
        class_name: "RLS Test Class A",
      })
      .select("id")
      .single();
    if (created) createdEventIds.push(created.id);

    const { data } = await parentB1
      .from("calendar_events")
      .select("id")
      .eq("id", created!.id);
    expect(data ?? []).toHaveLength(0);
  });

  it("lets a signed-in student see their own class cancellation and their own ad_hoc_lesson, but never a trial_lesson or block", async () => {
    const admin = serviceClient();
    const { data: created } = await admin
      .from("calendar_events")
      .insert([
        {
          teacher_id: fixtures.teacherA.id,
          event_type: "cancellation",
          event_date: "2026-09-09",
          class_id: fixtures.classA.id,
          class_name: "RLS Test Class A",
        },
        {
          teacher_id: fixtures.teacherA.id,
          event_type: "ad_hoc_lesson",
          event_date: "2026-09-10",
          start_time: "16:00",
          student_id: fixtures.studentA.id,
          student_name: "Student A",
        },
        {
          teacher_id: fixtures.teacherA.id,
          event_type: "trial_lesson",
          event_date: "2026-09-11",
          start_time: "10:00",
          contact_name: "Prospective Person",
        },
        {
          teacher_id: fixtures.teacherA.id,
          event_type: "block",
          event_date: "2026-09-11",
          title: "Dentist",
        },
      ])
      .select("id, event_type");
    for (const row of created ?? []) createdEventIds.push(row.id);

    const { data } = await studentA
      .from("calendar_events")
      .select("event_type")
      .in("id", (created ?? []).map((row) => row.id));

    expect(data?.map((row) => row.event_type).sort()).toEqual([
      "ad_hoc_lesson",
      "cancellation",
    ]);
  });

  it("survives deleting a class that still has a cancellation referencing it, snapshotting class_name and setting class_id null", async () => {
    const admin = serviceClient();
    const { data: throwawayClass, error: classError } = await admin
      .from("classes")
      .insert({
        teacher_id: fixtures.teacherA.id,
        name: "Throwaway Class For Delete Test",
        hours_per_week: 1,
      })
      .select("id")
      .single();
    expect(classError).toBeNull();

    const { data: event, error: eventError } = await teacherA
      .from("calendar_events")
      .insert({
        teacher_id: fixtures.teacherA.id,
        event_type: "cancellation",
        event_date: "2026-09-12",
        class_id: throwawayClass!.id,
        class_name: "Throwaway Class For Delete Test",
      })
      .select("id")
      .single();
    expect(eventError).toBeNull();
    if (event) createdEventIds.push(event.id);

    const { error: deleteError } = await teacherA
      .from("classes")
      .delete()
      .eq("id", throwawayClass!.id);
    expect(deleteError).toBeNull();

    const { data: survived } = await admin
      .from("calendar_events")
      .select("class_id, class_name")
      .eq("id", event!.id)
      .single();
    expect(survived?.class_id).toBeNull();
    expect(survived?.class_name).toBe("Throwaway Class For Delete Test");
  });

  it("rejects a second cancellation for the same class/date/occurrence", async () => {
    const admin = serviceClient();
    const { data: first } = await admin
      .from("calendar_events")
      .insert({
        teacher_id: fixtures.teacherA.id,
        event_type: "cancellation",
        event_date: "2026-09-13",
        class_id: fixtures.classA.id,
        class_name: "RLS Test Class A",
      })
      .select("id")
      .single();
    if (first) createdEventIds.push(first.id);

    const { error } = await teacherA.from("calendar_events").insert({
      teacher_id: fixtures.teacherA.id,
      event_type: "cancellation",
      event_date: "2026-09-13",
      class_id: fixtures.classA.id,
      class_name: "RLS Test Class A",
    });
    expect(error).not.toBeNull();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createMockSupabaseClient, type TableResponse } from "./support/mock-supabase";

vi.mock("@/lib/push/notify", () => ({
  notify: vi.fn(async () => ({ outcome: "sent" })),
}));

import { notify } from "@/lib/push/notify";
import {
  sendAttendanceSummary,
  sendInLessonAttendanceAlerts,
  sendYesterdayAttendanceSummary,
} from "@/lib/push/attendance-alerts";
import { DEFAULT_NOTIFICATION_SETTINGS } from "@/lib/push/settings";

const asClient = (client: ReturnType<typeof createMockSupabaseClient>) =>
  client as unknown as SupabaseClient;

// Monday 7 Sep 2026 (summer time, Athens = UTC+3). Algebra's grid slot is
// 16:00 → real lesson 16:15–17:00; Geometry's 18:00 → 18:15–19:00.
const MONDAY = "2026-09-07";
const athens = (time: string, date = MONDAY) => new Date(`${date}T${time}:00+03:00`);

const ok = (data: unknown): TableResponse => ({ data, error: null });

function school(
  overrides: Partial<Record<string, TableResponse | TableResponse[]>> = {},
) {
  return createMockSupabaseClient({
    notification_settings: ok(DEFAULT_NOTIFICATION_SETTINGS),
    classes: ok([
      { id: "c1", name: "Algebra", archived_at: null, start_date: null, finish_date: null },
      { id: "c2", name: "Geometry", archived_at: null, start_date: null, finish_date: null },
    ]),
    class_schedule_slots: ok([
      { day: "Mon", time: "16:00", class_id: "c1", is_two_hour: false, end_time: null },
      { day: "Mon", time: "18:00", class_id: "c2", is_two_hour: false, end_time: null },
    ]),
    calendar_events: ok([]),
    students: ok([
      { id: "s1", student_class_assignments: [{ class_id: "c1" }] },
      { id: "s2", student_class_assignments: [{ class_id: "c1" }] },
      { id: "s3", student_class_assignments: [{ class_id: "c2" }] },
    ]),
    attendance_records: ok([]),
    // First the "make sure a row exists" upsert, then the claim.
    attendance_alerts: [ok(null), ok([{ class_id: "c1" }, { class_id: "c2" }])],
    ...overrides,
  });
}

beforeEach(() => vi.clearAllMocks());

describe("in-lesson attendance alert", () => {
  it("alerts once a lesson has run 20 minutes with nobody marked", async () => {
    const client = school();

    expect(await sendInLessonAttendanceAlerts(asClient(client), athens("16:35"))).toBe(1);

    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "teacher_attendance_missing",
        to: { kind: "teachers" },
        values: { class: "Algebra", time: "16:15" },
        url: `/teacher-app/lesson/c1?date=${MONDAY}`,
        tag: `attendance-c1-${MONDAY}`,
      }),
    );
  });

  it("waits until the lesson has run 20 minutes", async () => {
    const client = school();

    expect(await sendInLessonAttendanceAlerts(asClient(client), athens("16:34"))).toBe(0);
    expect(client.from).not.toHaveBeenCalledWith("attendance_alerts");
  });

  it("stays quiet when anyone is marked, or the class has no students", async () => {
    const marked = school({ attendance_records: ok([{ class_id: "c1", student_id: "s2", status: "present" }]) });
    expect(await sendInLessonAttendanceAlerts(asClient(marked), athens("16:40"))).toBe(0);

    const empty = school({ students: ok([]) });
    expect(await sendInLessonAttendanceAlerts(asClient(empty), athens("16:40"))).toBe(0);
    expect(notify).not.toHaveBeenCalled();
  });

  it("leaves a lesson long finished to the summary", async () => {
    expect(await sendInLessonAttendanceAlerts(asClient(school()), athens("17:16"))).toBe(0);
  });

  it("skips a cancelled lesson", async () => {
    const client = school({
      calendar_events: ok([
        {
          id: "e1",
          event_type: "cancellation",
          event_date: MONDAY,
          start_time: null,
          end_time: null,
          class_id: "c1",
          class_name: "Algebra",
          student_id: null,
          student_name: null,
          contact_name: null,
          title: null,
          notes: null,
        },
      ]),
    });
    expect(await sendInLessonAttendanceAlerts(asClient(client), athens("16:40"))).toBe(0);
  });

  it("doesn't alert twice: a lesson another run already claimed is skipped", async () => {
    const client = school({ attendance_alerts: [ok(null), ok([])] });

    expect(await sendInLessonAttendanceAlerts(asClient(client), athens("16:40"))).toBe(0);
    expect(notify).not.toHaveBeenCalled();
  });

  it("does nothing when the switch is off", async () => {
    const client = school({
      notification_settings: ok({ ...DEFAULT_NOTIFICATION_SETTINGS, teacher_attendance_missing: false }),
    });

    expect(await sendInLessonAttendanceAlerts(asClient(client), athens("16:40"))).toBe(0);
    expect(client.from).not.toHaveBeenCalledWith("classes");
  });

  it("never throws", async () => {
    const client = school({ classes: { data: null, error: new Error("db down") } });
    await expect(sendInLessonAttendanceAlerts(asClient(client), athens("16:40"))).resolves.toBe(0);
  });
});

describe("attendance summary", () => {
  it("lists the day's ended lessons with nobody marked in one notice", async () => {
    const client = school();

    expect(await sendAttendanceSummary(asClient(client), MONDAY, athens("20:00"))).toBe(2);

    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "teacher_attendance_summary",
        to: { kind: "teachers" },
        values: expect.objectContaining({ lessons: "Algebra (16:15), Geometry (18:15)" }),
        url: "/teacher-app",
      }),
    );
  });

  it("leaves out a lesson that hasn't ended yet", async () => {
    const client = school({ attendance_alerts: [ok(null), ok([{ class_id: "c1" }])] });

    expect(await sendAttendanceSummary(asClient(client), MONDAY, athens("18:30"))).toBe(1);
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ values: expect.objectContaining({ lessons: "Algebra (16:15)" }) }),
    );
  });

  it("lists only what an earlier summary didn't", async () => {
    const client = school({ attendance_alerts: [ok(null), ok([{ class_id: "c2" }])] });

    expect(await sendAttendanceSummary(asClient(client), MONDAY, athens("20:00"))).toBe(1);
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ values: expect.objectContaining({ lessons: "Geometry (18:15)" }) }),
    );
  });

  it("sends nothing when everything was summarised already", async () => {
    const client = school({ attendance_alerts: [ok(null), ok([])] });

    expect(await sendAttendanceSummary(asClient(client), MONDAY, athens("20:00"))).toBe(0);
    expect(notify).not.toHaveBeenCalled();
  });

  it("covers all of yesterday at the morning run, linking to that day", async () => {
    const client = school();

    expect(
      await sendYesterdayAttendanceSummary(asClient(client), athens("10:00", "2026-09-08")),
    ).toBe(2);
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ url: `/teacher-app?date=${MONDAY}` }),
    );
  });
});

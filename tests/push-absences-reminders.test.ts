import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createMockSupabaseClient, type TableResponse } from "./support/mock-supabase";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
  createServiceRoleClient: vi.fn(),
}));
vi.mock("@/lib/push/notify", () => ({
  notify: vi.fn(async () => ({ outcome: "sent" })),
  pushToUsers: vi.fn(async () => ({ outcome: "sent" })),
}));
vi.mock("@/lib/push/class-lessons", () => ({ classLessons: vi.fn(async () => []) }));
vi.mock("@/lib/push/announcements", () => ({ sendDueAnnouncements: vi.fn(async () => 0) }));

import { createServiceRoleClient } from "@/lib/supabase/server";
import { notify } from "@/lib/push/notify";
import { classLessons } from "@/lib/push/class-lessons";
import { handleAttendanceChange, sendDueAbsenceNotices } from "@/lib/push/absences";
import { homeworkTargetDate, sendEveningReminders } from "@/lib/push/reminders";
import { DEFAULT_NOTIFICATION_SETTINGS } from "@/lib/push/settings";
import { GET as eveningCron } from "@/app/api/cron/evening-reminders/route";
import { GET as frequentCron } from "@/app/api/cron/notifications/route";

type Tables = Record<string, TableResponse | TableResponse[]>;
const client = (tables: Tables) => createMockSupabaseClient(tables);
const asClient = (c: ReturnType<typeof client>) => c as unknown as SupabaseClient;

function calls(c: ReturnType<typeof client>, table: string, method: string): unknown[][] {
  return c.from.mock.calls.flatMap((call, i) =>
    call[0] === table ? c.from.mock.results[i].value[method].mock.calls : [],
  );
}

// Tuesday 13 Oct 2026, 18:30 in Athens (UTC+3).
const NOW = new Date("2026-10-13T15:30:00Z");
const TODAY = "2026-10-13";
const TOMORROW = "2026-10-14";

const change = {
  attendanceRecordId: "rec-1",
  classId: "c1",
  className: "Β1",
  studentId: "s1",
  attendanceDate: TODAY,
  status: "absent",
  triggeredBy: "teacher-1",
};

beforeEach(() => vi.clearAllMocks());

describe("absence notices - right away (default)", () => {
  const tables = (overrides: Tables = {}) =>
    client({
      notification_settings: { data: DEFAULT_NOTIFICATION_SETTINGS, error: null },
      absence_notifications: { data: [{ id: "an-1" }], error: null },
      students: { data: { first_name: "Μαρία" }, error: null },
      ...overrides,
    });

  it("tells the student and the parents, each in their own words", async () => {
    await handleAttendanceChange(asClient(tables()), change, NOW);
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "absence_student",
        parentEvent: "absence_parent",
        to: { kind: "student_and_parents", studentId: "s1" },
        values: { class: "Β1", date: "13/10", student: "Μαρία" },
      }),
    );
  });

  it("never notifies twice for the same lesson", async () => {
    // The "already told" row exists: the upsert inserts nothing.
    await handleAttendanceChange(asClient(tables({ absence_notifications: { data: [], error: null } })), change, NOW);
    expect(notify).not.toHaveBeenCalled();
  });

  it("says nothing for a past lesson, for late or 1+1, or with the switch off", async () => {
    await handleAttendanceChange(asClient(tables()), { ...change, attendanceDate: "2026-10-12" }, NOW);
    await handleAttendanceChange(asClient(tables()), { ...change, status: "late" }, NOW);
    await handleAttendanceChange(asClient(tables()), { ...change, status: "split" }, NOW);
    await handleAttendanceChange(
      asClient(tables({ notification_settings: { data: { ...DEFAULT_NOTIFICATION_SETTINGS, absences: false }, error: null } })),
      change,
      NOW,
    );
    expect(notify).not.toHaveBeenCalled();
  });
});

describe("absence notices - 2 hours after the lesson", () => {
  const settings = { ...DEFAULT_NOTIFICATION_SETTINGS, absence_timing: "after_lesson" as const };

  it("queues the notice for the lesson's end + 2h", async () => {
    vi.mocked(classLessons).mockResolvedValue([{ date: TODAY, start: "17:15", end: "19:00" }]);
    const c = client({
      notification_settings: { data: settings, error: null },
      absence_notifications: { data: null, error: null },
    });
    await handleAttendanceChange(asClient(c), change, new Date("2026-10-13T14:30:00Z"));
    expect(notify).not.toHaveBeenCalled();
    expect(calls(c, "absence_notifications", "upsert")[0][0]).toEqual(
      expect.objectContaining({
        attendance_record_id: "rec-1",
        // 19:00 Athens = 16:00 UTC, + 2 hours.
        send_at: "2026-10-13T18:00:00.000Z",
      }),
    );
  });

  it("a mark saved after that point the same day goes out at the next run", async () => {
    vi.mocked(classLessons).mockResolvedValue([{ date: TODAY, start: "10:15", end: "11:00" }]);
    const c = client({
      notification_settings: { data: settings, error: null },
      absence_notifications: { data: null, error: null },
    });
    await handleAttendanceChange(asClient(c), change, NOW);
    expect(calls(c, "absence_notifications", "upsert")[0][0]).toEqual(
      expect.objectContaining({ send_at: NOW.toISOString() }),
    );
  });

  it("correcting the mark withdraws a notice that hasn't gone out", async () => {
    const c = client({ absence_notifications: { data: null, error: null } });
    await handleAttendanceChange(asClient(c), { ...change, status: "present" }, NOW);
    expect(calls(c, "absence_notifications", "delete")).toHaveLength(1);
    expect(calls(c, "absence_notifications", "is")).toContainEqual(["sent_at", null]);
  });

  it("the sender re-checks the mark is still 'absent' before sending", async () => {
    const due = { id: "an-1", attendance_record_id: "rec-1", student_id: "s1", class_id: "c1", attendance_date: TODAY };
    const stillAbsent = client({
      absence_notifications: [{ data: [due], error: null }, { data: [{ id: "an-1" }], error: null }],
      attendance_records: { data: { status: "absent", class_name: "Β1" }, error: null },
      students: { data: { first_name: "Μαρία" }, error: null },
    });
    expect(await sendDueAbsenceNotices(asClient(stillAbsent), NOW)).toBe(1);

    const corrected = client({
      absence_notifications: [{ data: [due], error: null }, { data: [{ id: "an-1" }], error: null }],
      attendance_records: { data: { status: "present", class_name: "Β1" }, error: null },
    });
    expect(await sendDueAbsenceNotices(asClient(corrected), NOW)).toBe(0);

    const nextDay = client({
      absence_notifications: [{ data: [{ ...due, attendance_date: "2026-10-12" }], error: null }, { data: [{ id: "an-1" }], error: null }],
    });
    expect(await sendDueAbsenceNotices(asClient(nextDay), NOW)).toBe(0);
    expect(notify).toHaveBeenCalledTimes(1);
  });
});

describe("homework target date", () => {
  it("is the due date when there is one", async () => {
    expect(
      await homeworkTargetDate(asClient(client({})), { class_id: "c1", due_date: "2026-10-20", created_at: NOW.toISOString() }),
    ).toBe("2026-10-20");
  });

  it("otherwise the class's next lesson after the day it was set (cancellations already applied)", async () => {
    vi.mocked(classLessons).mockResolvedValue([{ date: "2026-10-16", start: "17:15", end: "18:00" }]);
    expect(
      await homeworkTargetDate(asClient(client({})), { class_id: "c1", due_date: null, created_at: NOW.toISOString() }),
    ).toBe("2026-10-16");
    expect(classLessons).toHaveBeenCalledWith(expect.anything(), "c1", TOMORROW, "2026-11-04");
  });
});

describe("evening reminders", () => {
  const evening = new Date("2026-10-13T17:05:00Z"); // 20:05 in Athens
  const base = (overrides: Tables = {}) =>
    client({
      notification_settings: { data: DEFAULT_NOTIFICATION_SETTINGS, error: null },
      homework: [
        {
          data: [
            { id: "h1", class_id: "c1", note: "σελ. 42", due_date: TOMORROW, created_at: "2026-10-10T10:00:00Z", classes: { name: "Β1" } },
            { id: "h2", class_id: "c1", note: "παλιά", due_date: "2026-10-12", created_at: "2026-10-05T10:00:00Z", classes: { name: "Β1" } },
          ],
          error: null,
        },
        { data: [{ id: "h1" }], error: null }, // claim h1
        { data: [{ id: "h2" }], error: null }, // retire h2 (its date passed)
      ],
      quiz_assignments: [
        { data: [{ id: "qa1", quiz_id: "q1", class_id: "c1", quizzes: { title: "Παράγωγοι", notifications_disabled: false }, classes: { name: "Β1" } }], error: null },
        { data: [{ id: "qa1" }], error: null },
      ],
      student_class_assignments: { data: [{ student_id: "s1" }, { student_id: "s2" }], error: null },
      quiz_attempts: { data: [{ student_id: "s1" }], error: null },
      assessment_assignments: [
        {
          data: [
            { id: "aa1", assessment_id: "a1", student_id: "s1", kind: "mock_exam", effective_scheduled_date: TOMORROW, effective_scheduled_time: "10:00", effective_deadline_at: null, assessments: { title: "Όρια", notifications_disabled: false, class_id: "c1" } },
            { id: "aa2", assessment_id: "a1", student_id: "s2", kind: "mock_exam", effective_scheduled_date: TOMORROW, effective_scheduled_time: "10:00", effective_deadline_at: null, assessments: { title: "Όρια", notifications_disabled: false, class_id: "c1" } },
          ],
          error: null,
        },
        { data: [], error: null },
        { data: [{ id: "aa1" }, { id: "aa2" }], error: null },
      ],
      ...overrides,
    });

  it("reminds homework due tomorrow, the quiz to those who haven't done it, and the test once for all its students", async () => {
    const result = await sendEveningReminders(asClient(base()), { now: evening });
    expect(result).toEqual({ homework: 1, quizzes: 1, tests: 1 });
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ event: "homework_reminder", values: expect.objectContaining({ class: "Β1", note: "σελ. 42" }) }),
    );
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ event: "quiz_reminder", to: { kind: "students", studentIds: ["s2"] } }),
    );
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "assessment_reminder",
        to: { kind: "students", studentIds: ["s1", "s2"] },
        values: { title: "Όρια", date: "14/10", time: "10:00" },
      }),
    );
  });

  it("waits for the App tab's time unless forced (the daily cron)", async () => {
    const early = new Date("2026-10-13T14:00:00Z"); // 17:00 in Athens
    expect(await sendEveningReminders(asClient(base()), { now: early })).toEqual({ homework: 0, quizzes: 0, tests: 0 });
    expect(notify).not.toHaveBeenCalled();
    expect((await sendEveningReminders(asClient(base()), { now: early, force: true })).homework).toBe(1);
  });

  it("skips a quiz flagged «Χωρίς ειδοποιήσεις» and a type switched off", async () => {
    const result = await sendEveningReminders(
      asClient(
        base({
          notification_settings: { data: { ...DEFAULT_NOTIFICATION_SETTINGS, test_reminders: false, homework_reminders: false }, error: null },
          quiz_assignments: [
            { data: [{ id: "qa1", quiz_id: "q1", class_id: "c1", quizzes: { title: "Π", notifications_disabled: true }, classes: { name: "Β1" } }], error: null },
            { data: [{ id: "qa1" }], error: null },
          ],
        }),
      ),
      { now: evening },
    );
    expect(result).toEqual({ homework: 0, quizzes: 0, tests: 0 });
    expect(notify).not.toHaveBeenCalled();
  });
});

describe("notification cron routes", () => {
  const request = (auth?: string) =>
    new Request("https://www.modusmath.gr/api/cron/x", {
      headers: auth ? { authorization: auth } : {},
    });

  beforeEach(() => {
    process.env.CRON_SECRET = "s3cret";
    vi.mocked(createServiceRoleClient).mockReturnValue(
      client({
        notification_settings: { data: DEFAULT_NOTIFICATION_SETTINGS, error: null },
        absence_notifications: { data: [], error: null },
        notification_queue: { data: [], error: null },
        homework: { data: [], error: null },
        quiz_assignments: { data: [], error: null },
        assessment_assignments: { data: [], error: null },
        notification_job_runs: { data: null, error: null },
      }) as never,
    );
  });

  it("refuse a missing or wrong secret, and fail closed without one", async () => {
    expect((await eveningCron(request())).status).toBe(401);
    expect((await frequentCron(request("Bearer nope"))).status).toBe(401);
    delete process.env.CRON_SECRET;
    expect((await eveningCron(request("Bearer s3cret"))).status).toBe(500);
    expect(createServiceRoleClient).not.toHaveBeenCalled();
  });

  it("run with the right secret and record the run for the App tab", async () => {
    const evening = await eveningCron(request("Bearer s3cret"));
    expect(evening.status).toBe(200);
    const frequent = await frequentCron(request("Bearer s3cret"));
    expect(await frequent.json()).toEqual(
      expect.objectContaining({ absences: 0, announcements: 0 }),
    );
    const admin = vi.mocked(createServiceRoleClient).mock.results[0].value as ReturnType<typeof client>;
    expect(calls(admin, "notification_job_runs", "upsert").map((c) => (c[0] as { job: string }).job)).toEqual([
      "evening_reminders",
      "frequent",
    ]);
  });
});

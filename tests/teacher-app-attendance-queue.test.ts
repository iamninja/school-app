/// <reference types="vitest/globals" />

import { vi } from "vitest";
import {
  ATTENDANCE_QUEUE_KEY,
  __resetAttendanceQueueForTests,
  dropQueuedMark,
  enqueueMark,
  flushQueue,
  getQueueSnapshot,
  isNetworkError,
  type QueuedMark,
} from "@/lib/teacher-app/attendance-queue";
import { ExpectedError } from "@/lib/expected-error";

function mark(overrides: Partial<QueuedMark> = {}): QueuedMark {
  return {
    classId: "c1",
    className: "Algebra",
    date: "2026-10-14",
    studentId: "s1",
    studentName: "Maya Carter",
    status: "present",
    queuedAt: 1,
    ...overrides,
  };
}

describe("attendance queue", () => {
  beforeEach(() => {
    window.localStorage.clear();
    __resetAttendanceQueueForTests();
  });

  it("keeps one entry per student and lesson, the latest tap winning", () => {
    enqueueMark(mark({ status: "present", queuedAt: 1 }));
    enqueueMark(mark({ status: "absent", queuedAt: 2 }));
    enqueueMark(mark({ studentId: "s2", queuedAt: 3 }));

    expect(getQueueSnapshot().map((m) => [m.studentId, m.status])).toEqual([
      ["s1", "absent"],
      ["s2", "present"],
    ]);
    expect(JSON.parse(window.localStorage.getItem(ATTENDANCE_QUEUE_KEY)!)).toHaveLength(2);
  });

  it("survives a reload and ignores corrupt storage", () => {
    enqueueMark(mark());
    __resetAttendanceQueueForTests();
    expect(getQueueSnapshot()).toHaveLength(1);

    window.localStorage.setItem(ATTENDANCE_QUEUE_KEY, "{not json");
    __resetAttendanceQueueForTests();
    expect(getQueueSnapshot()).toEqual([]);

    window.localStorage.setItem(ATTENDANCE_QUEUE_KEY, JSON.stringify([{ classId: 1 }, mark()]));
    __resetAttendanceQueueForTests();
    expect(getQueueSnapshot()).toHaveLength(1);
  });

  it("drops a queued mark when a newer one is saved directly", () => {
    enqueueMark(mark());
    dropQueuedMark({ classId: "c1", date: "2026-10-14", studentId: "s1" });
    expect(getQueueSnapshot()).toEqual([]);
  });

  it("sends oldest first and clears what was sent", async () => {
    enqueueMark(mark({ studentId: "s2", queuedAt: 5 }));
    enqueueMark(mark({ studentId: "s1", queuedAt: 2 }));
    const send = vi.fn().mockResolvedValue({});

    const result = await flushQueue(send);

    expect(send.mock.calls.map(([data]) => data.studentId)).toEqual(["s1", "s2"]);
    expect(send).toHaveBeenCalledWith({
      classId: "c1",
      className: "Algebra",
      studentId: "s1",
      attendanceDate: "2026-10-14",
      status: "present",
    });
    expect(result).toEqual({ sent: 2, rejected: [], offline: false });
    expect(getQueueSnapshot()).toEqual([]);
  });

  it("stops at a network failure and keeps the rest", async () => {
    enqueueMark(mark({ studentId: "s1", queuedAt: 1 }));
    enqueueMark(mark({ studentId: "s2", queuedAt: 2 }));
    const send = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));

    const result = await flushQueue(send);

    expect(send).toHaveBeenCalledTimes(1);
    expect(result.offline).toBe(true);
    expect(getQueueSnapshot()).toHaveLength(2);
  });

  it("drops a mark the server refuses and carries on", async () => {
    enqueueMark(mark({ studentId: "s1", queuedAt: 1 }));
    enqueueMark(mark({ studentId: "s2", queuedAt: 2 }));
    const refusal = new ExpectedError("That student left the class");
    const send = vi.fn().mockRejectedValueOnce(refusal).mockResolvedValueOnce({});

    const result = await flushQueue(send);

    expect(result.sent).toBe(1);
    expect(result.rejected).toEqual([{ mark: expect.objectContaining({ studentId: "s1" }), error: refusal }]);
    expect(getQueueSnapshot()).toEqual([]);
  });

  it("keeps a newer tap queued while an older one was sending", async () => {
    enqueueMark(mark({ status: "present", queuedAt: 1 }));
    const send = vi.fn().mockImplementation(async () => {
      enqueueMark(mark({ status: "absent", queuedAt: 2 }));
    });

    await flushQueue(send);

    expect(getQueueSnapshot()).toEqual([expect.objectContaining({ status: "absent", queuedAt: 2 })]);
  });

  it("tells a dropped connection from a server refusal", () => {
    expect(isNetworkError(new TypeError("Failed to fetch"))).toBe(true);
    expect(isNetworkError(new Error("An unexpected response was received from the server."))).toBe(true);
    expect(isNetworkError(new ExpectedError("Not allowed"))).toBe(false);
    expect(isNetworkError(Object.assign(new Error("masked"), { digest: "12345" }))).toBe(false);
    expect(isNetworkError(new Error("boom"))).toBe(false);
  });
});

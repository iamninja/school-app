import { describe, expect, it, vi, beforeEach } from "vitest";
import { createClient } from "@/lib/supabase/server";
import { requireTeacher } from "@/lib/auth/require-teacher";
import { ExpectedError } from "@/lib/expected-error";
import {
  createCalendarEventAction,
  deleteCalendarEventAction,
  updateCalendarEventAction,
} from "@/app/protected/teacher/calendar-actions";
import { createMockSupabaseClient } from "./support/mock-supabase";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/auth/require-teacher", () => ({
  requireTeacher: vi.fn(),
}));

const CLASS_ROW = { id: "class-1", name: "Class A", archived_at: null };
const ARCHIVED_CLASS_ROW = {
  id: "class-1",
  name: "Class A",
  archived_at: "2026-08-01T00:00:00Z",
};
const STUDENT_ROW = { id: "student-1", first_name: "Ada", last_name: "Lovelace" };

describe("calendar event actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireTeacher).mockResolvedValue(undefined);
  });

  it("rejects a cancellation with no classId", async () => {
    const client = createMockSupabaseClient({});
    vi.mocked(createClient).mockResolvedValue(client as never);

    await expect(
      createCalendarEventAction({
        eventType: "cancellation",
        eventDate: "2026-09-07",
      }),
    ).rejects.toThrow(ExpectedError);
  });

  it("rejects an ad_hoc_lesson with no studentId", async () => {
    const client = createMockSupabaseClient({});
    vi.mocked(createClient).mockResolvedValue(client as never);

    await expect(
      createCalendarEventAction({
        eventType: "ad_hoc_lesson",
        eventDate: "2026-09-07",
        startTime: "16:00",
      }),
    ).rejects.toThrow(ExpectedError);
  });

  it("rejects a trial_lesson with no contactName", async () => {
    const client = createMockSupabaseClient({});
    vi.mocked(createClient).mockResolvedValue(client as never);

    await expect(
      createCalendarEventAction({
        eventType: "trial_lesson",
        eventDate: "2026-09-07",
        startTime: "10:00",
      }),
    ).rejects.toThrow(ExpectedError);
  });

  it("rejects a block with no title", async () => {
    const client = createMockSupabaseClient({});
    vi.mocked(createClient).mockResolvedValue(client as never);

    await expect(
      createCalendarEventAction({
        eventType: "block",
        eventDate: "2026-09-07",
      }),
    ).rejects.toThrow(ExpectedError);
  });

  it("rejects a malformed start time", async () => {
    const client = createMockSupabaseClient({});
    vi.mocked(createClient).mockResolvedValue(client as never);

    await expect(
      createCalendarEventAction({
        eventType: "block",
        eventDate: "2026-09-07",
        title: "Dentist",
        startTime: "9am",
      }),
    ).rejects.toThrow(ExpectedError);
  });

  it("rejects an end time that isn't after the start time", async () => {
    const client = createMockSupabaseClient({});
    vi.mocked(createClient).mockResolvedValue(client as never);

    await expect(
      createCalendarEventAction({
        eventType: "block",
        eventDate: "2026-09-07",
        title: "Dentist",
        startTime: "10:00",
        endTime: "09:00",
      }),
    ).rejects.toThrow(ExpectedError);
  });

  it("rejects a classId that doesn't belong to this teacher", async () => {
    const client = createMockSupabaseClient({
      classes: { data: null, error: null },
    });
    vi.mocked(createClient).mockResolvedValue(client as never);

    await expect(
      createCalendarEventAction({
        eventType: "cancellation",
        eventDate: "2026-09-07",
        classId: "class-not-mine",
      }),
    ).rejects.toThrow(ExpectedError);

    // No insert should have been attempted once ownership fails.
    expect(client.from).not.toHaveBeenCalledWith("calendar_events");
  });

  it("rejects an extra_session against an archived class", async () => {
    const client = createMockSupabaseClient({
      classes: { data: ARCHIVED_CLASS_ROW, error: null },
    });
    vi.mocked(createClient).mockResolvedValue(client as never);

    await expect(
      createCalendarEventAction({
        eventType: "extra_session",
        eventDate: "2026-09-07",
        startTime: "17:00",
        classId: "class-1",
      }),
    ).rejects.toThrow(ExpectedError);
  });

  it("snapshots class_name from the looked-up row, not client input", async () => {
    const client = createMockSupabaseClient({
      classes: { data: CLASS_ROW, error: null },
      calendar_events: {
        data: { id: "evt-1", event_type: "cancellation", class_name: "Class A" },
        error: null,
      },
    });
    vi.mocked(createClient).mockResolvedValue(client as never);

    await createCalendarEventAction({
      eventType: "cancellation",
      eventDate: "2026-09-07",
      classId: "class-1",
    });

    const insertedRow = client.from.mock.results.find(
      (r, i) => client.from.mock.calls[i][0] === "calendar_events",
    )?.value.insert.mock.calls[0][0];
    expect(insertedRow.class_name).toBe("Class A");
    expect(insertedRow.class_id).toBe("class-1");
  });

  it("snapshots student_name from the looked-up row, not client input", async () => {
    const client = createMockSupabaseClient({
      students: { data: STUDENT_ROW, error: null },
      calendar_events: {
        data: { id: "evt-1", event_type: "ad_hoc_lesson" },
        error: null,
      },
    });
    vi.mocked(createClient).mockResolvedValue(client as never);

    await createCalendarEventAction({
      eventType: "ad_hoc_lesson",
      eventDate: "2026-09-07",
      startTime: "16:00",
      studentId: "student-1",
    });

    const insertedRow = client.from.mock.results.find(
      (r, i) => client.from.mock.calls[i][0] === "calendar_events",
    )?.value.insert.mock.calls[0][0];
    expect(insertedRow.student_name).toBe("Ada Lovelace");
    expect(insertedRow.student_id).toBe("student-1");
  });

  it("rejects changing an event's type on update", async () => {
    const client = createMockSupabaseClient({
      calendar_events: { data: { event_type: "block" }, error: null },
    });
    vi.mocked(createClient).mockResolvedValue(client as never);

    await expect(
      updateCalendarEventAction("evt-1", {
        eventType: "trial_lesson",
        eventDate: "2026-09-07",
        startTime: "10:00",
        contactName: "Someone",
      }),
    ).rejects.toThrow(ExpectedError);
  });

  it("scopes update by teacher_id", async () => {
    const client = createMockSupabaseClient({
      calendar_events: [
        { data: { event_type: "block" }, error: null },
        { data: { id: "evt-1", event_type: "block", title: "Updated" }, error: null },
      ],
    });
    vi.mocked(createClient).mockResolvedValue(client as never);

    await updateCalendarEventAction("evt-1", {
      eventType: "block",
      eventDate: "2026-09-07",
      title: "Updated",
    });

    expect(
      client.from.mock.results.at(-1)?.value.eq,
    ).toHaveBeenCalledWith("teacher_id", "teacher-1");
  });

  it("scopes delete by teacher_id", async () => {
    const client = createMockSupabaseClient({
      calendar_events: { data: null, error: null },
    });
    vi.mocked(createClient).mockResolvedValue(client as never);

    await deleteCalendarEventAction("evt-1");

    expect(client.from.mock.results[0].value.eq).toHaveBeenCalledWith(
      "teacher_id",
      "teacher-1",
    );
  });

  it("requires teacher authorization before touching any calendar data", async () => {
    vi.mocked(requireTeacher).mockRejectedValue(
      new Error("Not authorized as a teacher"),
    );
    vi.mocked(createClient).mockResolvedValue(
      createMockSupabaseClient({}, { id: "parent-1" }) as never,
    );

    await expect(
      createCalendarEventAction({
        eventType: "block",
        eventDate: "2026-09-07",
        title: "Dentist",
      }),
    ).rejects.toThrow("Not authorized as a teacher");
  });
});

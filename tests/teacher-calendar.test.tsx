import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { format } from "date-fns";
import { TeacherCalendar } from "@/components/teacher-calendar";
import * as calendarActions from "@/app/protected/teacher/calendar-actions";
import {
  fromIsoDate,
  toIsoDate,
  weekdayLabelFromDate,
} from "@/lib/calendar-projection";
import type { CalendarEvent } from "@/lib/types/database";
import type { AttendanceRecord } from "@/lib/attendance-records";

vi.mock("@/app/protected/teacher/calendar-actions", () => ({
  createCalendarEventAction: vi.fn(),
  updateCalendarEventAction: vi.fn(),
  deleteCalendarEventAction: vi.fn(),
  rescheduleClassOccurrenceAction: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const todayIso = toIsoDate(new Date());
const todayWeekday = weekdayLabelFromDate(new Date());

const classA = { id: "class-1", name: "Algebra II", archivedAt: null };
const classB = { id: "class-2", name: "Geometry", archivedAt: null };
const studentA = {
  id: "student-1",
  firstName: "Ada",
  lastName: "Lovelace",
  gradeLevel: "10",
  email: "ada@example.com",
  assignedClassIds: [classA.id],
};

function renderCalendar(overrides: {
  events?: CalendarEvent[];
  slots?: Array<{ classId: string; day: string; time: string }>;
  classes?: Array<{ id: string; name: string; archivedAt: string | null }>;
  attendanceRecords?: AttendanceRecord[];
} = {}) {
  const events = overrides.events ?? [];
  const onEventsChange = vi.fn();
  const onAttendanceRecordsChange = vi.fn();
  render(
    <TeacherCalendar
      events={events}
      onEventsChange={onEventsChange}
      classes={overrides.classes ?? [classA]}
      students={[studentA]}
      slots={overrides.slots ?? []}
      attendanceRecords={overrides.attendanceRecords ?? []}
      onAttendanceRecordsChange={onAttendanceRecordsChange}
    />,
  );
  return { onEventsChange, onAttendanceRecordsChange };
}

describe("TeacherCalendar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows a nothing-scheduled message for a day with no occurrences", () => {
    renderCalendar();
    // Both the day-detail panel and the new Attendance section below the
    // week block show this same empty state when nothing's scheduled.
    expect(
      screen.getAllByText("Nothing scheduled.").length,
    ).toBeGreaterThan(0);
  });

  it("marks today's cell in the month view", () => {
    renderCalendar();
    expect(document.querySelector(".ring-sky-500")).not.toBeNull();
  });

  it("shows a Today badge on today's column in the week strip", () => {
    renderCalendar();
    const weekCard = screen
      .getByText(/^week of/i)
      .closest(".rounded-2xl") as HTMLElement;
    expect(within(weekCard).getByText("Today")).toBeInTheDocument();
  });

  it("shows today's recurring class with a Cancel action", () => {
    renderCalendar({
      slots: [{ classId: classA.id, day: todayWeekday, time: "15:00" }],
    });

    expect(screen.getByText(/15:00 · Algebra II/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /cancel this class/i }),
    ).toBeInTheDocument();
  });

  it("shows the same recurring class in the read-only week strip below", () => {
    renderCalendar({
      slots: [{ classId: classA.id, day: todayWeekday, time: "15:00" }],
    });

    const weekCard = screen
      .getByText(/^week of/i)
      .closest(".rounded-2xl") as HTMLElement;
    expect(within(weekCard).getByText("15:00")).toBeInTheDocument();
    expect(within(weekCard).getByText("Algebra II")).toBeInTheDocument();
    // Read-only: no Cancel/Edit/Delete controls inside the week strip itself.
    expect(
      within(weekCard).queryByRole("button"),
    ).not.toBeInTheDocument();
  });

  it("shows a cancelled occurrence struck through in the week strip", async () => {
    renderCalendar({
      slots: [{ classId: classA.id, day: todayWeekday, time: "15:00" }],
      events: [
        {
          id: "evt-cancel-1",
          event_type: "cancellation",
          event_date: todayIso,
          start_time: "15:00",
          end_time: null,
          class_id: classA.id,
          class_name: "Algebra II",
          student_id: null,
          student_name: null,
          contact_name: null,
          contact_phone: null,
          title: null,
          notes: null,
          created_at: "2026-08-01T00:00:00Z",
        },
      ],
    });

    const weekCard = screen
      .getByText(/^week of/i)
      .closest(".rounded-2xl") as HTMLElement;
    expect(within(weekCard).getByText("Cancelled")).toBeInTheDocument();
  });

  it("shows no overlap warning when nothing collides", () => {
    renderCalendar({
      slots: [{ classId: classA.id, day: todayWeekday, time: "15:00" }],
    });

    expect(
      screen.queryByText(/overlapping lessons this week/i),
    ).not.toBeInTheDocument();
  });

  it("warns when two lessons land on the same day and time", () => {
    renderCalendar({
      classes: [classA, classB],
      slots: [{ classId: classA.id, day: todayWeekday, time: "15:00" }],
      events: [
        {
          id: "evt-extra-1",
          event_type: "extra_session",
          event_date: todayIso,
          start_time: "15:00",
          end_time: null,
          class_id: classB.id,
          class_name: "Geometry",
          student_id: null,
          student_name: null,
          contact_name: null,
          contact_phone: null,
          title: null,
          notes: null,
          created_at: "2026-08-01T00:00:00Z",
        },
      ],
    });

    const weekCard = screen
      .getByText(/^week of/i)
      .closest(".rounded-2xl") as HTMLElement;
    expect(
      within(weekCard).getByText(/overlapping lessons this week/i),
    ).toBeInTheDocument();
    expect(
      within(weekCard).getByText(
        /Algebra II \(15:15–16:00\) overlaps Geometry \(15:00–15:45\)/,
      ),
    ).toBeInTheDocument();

    const todayColumn = screen
      .getAllByText(/^\w{3} \d+$/)
      .find((el) => el.textContent?.startsWith(format(fromIsoDate(todayIso), "EEE d")))
      ?.closest(".rounded-md") as HTMLElement;
    expect(todayColumn.className).toContain("border-rose-500");
  });

  it("does not highlight a day's border when it has no overlap", () => {
    renderCalendar({
      slots: [{ classId: classA.id, day: todayWeekday, time: "15:00" }],
    });

    const todayColumn = screen
      .getAllByText(/^\w{3} \d+$/)
      .find((el) => el.textContent?.startsWith(format(fromIsoDate(todayIso), "EEE d")))
      ?.closest(".rounded-md") as HTMLElement;
    expect(todayColumn.className).not.toContain("border-rose-500");
  });

  it("derives a recurring class's real teaching window from the schedule grid when flagging an overlap", () => {
    // 18:00 is a real weekday grid slot with a 15-minute break baked in, so
    // its actual teaching window is 18:15-19:00 - an extra session starting
    // at 18:30 (no end time, so a flat 45-minute lesson) genuinely overlaps
    // it even though neither row has an explicit end time stored anywhere.
    renderCalendar({
      classes: [classA, classB],
      slots: [{ classId: classA.id, day: todayWeekday, time: "18:00" }],
      events: [
        {
          id: "evt-extra-1",
          event_type: "extra_session",
          event_date: todayIso,
          start_time: "18:30",
          end_time: null,
          class_id: classB.id,
          class_name: "Geometry",
          student_id: null,
          student_name: null,
          contact_name: null,
          contact_phone: null,
          title: null,
          notes: null,
          created_at: "2026-08-01T00:00:00Z",
        },
      ],
    });

    const weekCard = screen
      .getByText(/^week of/i)
      .closest(".rounded-2xl") as HTMLElement;
    expect(
      within(weekCard).getByText(
        /Algebra II \(18:15–19:00\) overlaps Geometry \(18:30–19:15\)/,
      ),
    ).toBeInTheDocument();
  });

  it("does not flag a recurring class against a lesson scheduled during its break", () => {
    // 18:00 slot's break runs 18:00-18:15 - a 10-minute extra session
    // starting right at 18:00 ends before the actual lesson (18:15) begins.
    renderCalendar({
      classes: [classA, classB],
      slots: [{ classId: classA.id, day: todayWeekday, time: "18:00" }],
      events: [
        {
          id: "evt-extra-1",
          event_type: "extra_session",
          event_date: todayIso,
          start_time: "18:00",
          end_time: "18:10",
          class_id: classB.id,
          class_name: "Geometry",
          student_id: null,
          student_name: null,
          contact_name: null,
          contact_phone: null,
          title: null,
          notes: null,
          created_at: "2026-08-01T00:00:00Z",
        },
      ],
    });

    expect(
      screen.queryByText(/overlapping lessons this week/i),
    ).not.toBeInTheDocument();
  });

  it("flags a genuine time-range overlap even with different start times", () => {
    renderCalendar({
      classes: [classA, classB],
      slots: [],
      events: [
        {
          id: "evt-extra-1",
          event_type: "extra_session",
          event_date: todayIso,
          start_time: "15:00",
          end_time: "16:00",
          class_id: classA.id,
          class_name: "Algebra II",
          student_id: null,
          student_name: null,
          contact_name: null,
          contact_phone: null,
          title: null,
          notes: null,
          created_at: "2026-08-01T00:00:00Z",
        },
        {
          id: "evt-extra-2",
          event_type: "extra_session",
          event_date: todayIso,
          start_time: "15:30",
          end_time: "18:00",
          class_id: classB.id,
          class_name: "Geometry",
          student_id: null,
          student_name: null,
          contact_name: null,
          contact_phone: null,
          title: null,
          notes: null,
          created_at: "2026-08-01T00:00:00Z",
        },
      ],
    });

    const weekCard = screen
      .getByText(/^week of/i)
      .closest(".rounded-2xl") as HTMLElement;
    expect(
      within(weekCard).getByText(
        /Algebra II \(15:00–16:00\) overlaps Geometry \(15:30–18:00\)/,
      ),
    ).toBeInTheDocument();
  });

  it("does not flag back-to-back lessons that only touch at the boundary", () => {
    renderCalendar({
      classes: [classA, classB],
      slots: [],
      events: [
        {
          id: "evt-extra-1",
          event_type: "extra_session",
          event_date: todayIso,
          start_time: "15:00",
          end_time: "16:00",
          class_id: classA.id,
          class_name: "Algebra II",
          student_id: null,
          student_name: null,
          contact_name: null,
          contact_phone: null,
          title: null,
          notes: null,
          created_at: "2026-08-01T00:00:00Z",
        },
        {
          id: "evt-extra-2",
          event_type: "extra_session",
          event_date: todayIso,
          start_time: "16:00",
          end_time: "17:00",
          class_id: classB.id,
          class_name: "Geometry",
          student_id: null,
          student_name: null,
          contact_name: null,
          contact_phone: null,
          title: null,
          notes: null,
          created_at: "2026-08-01T00:00:00Z",
        },
      ],
    });

    expect(
      screen.queryByText(/overlapping lessons this week/i),
    ).not.toBeInTheDocument();
  });

  it("does not treat a cancelled occurrence as part of an overlap", () => {
    renderCalendar({
      classes: [classA, classB],
      slots: [{ classId: classA.id, day: todayWeekday, time: "15:00" }],
      events: [
        {
          id: "evt-cancel-1",
          event_type: "cancellation",
          event_date: todayIso,
          start_time: "15:00",
          end_time: null,
          class_id: classA.id,
          class_name: "Algebra II",
          student_id: null,
          student_name: null,
          contact_name: null,
          contact_phone: null,
          title: null,
          notes: null,
          created_at: "2026-08-01T00:00:00Z",
        },
        {
          id: "evt-extra-1",
          event_type: "extra_session",
          event_date: todayIso,
          start_time: "15:00",
          end_time: null,
          class_id: classB.id,
          class_name: "Geometry",
          student_id: null,
          student_name: null,
          contact_name: null,
          contact_phone: null,
          title: null,
          notes: null,
          created_at: "2026-08-01T00:00:00Z",
        },
      ],
    });

    expect(
      screen.queryByText(/overlapping lessons this week/i),
    ).not.toBeInTheDocument();
  });

  it("cancels today's recurring occurrence", async () => {
    const user = userEvent.setup();
    const created: CalendarEvent = {
      id: "evt-cancel-1",
      event_type: "cancellation",
      event_date: todayIso,
      start_time: "15:00",
      end_time: null,
      class_id: classA.id,
      class_name: "Algebra II",
      student_id: null,
      student_name: null,
      contact_name: null,
      contact_phone: null,
      title: null,
      notes: null,
      created_at: "2026-08-01T00:00:00Z",
    };
    vi.mocked(calendarActions.createCalendarEventAction).mockResolvedValue(
      created,
    );

    const { onEventsChange } = renderCalendar({
      slots: [{ classId: classA.id, day: todayWeekday, time: "15:00" }],
    });

    await user.click(
      screen.getByRole("button", { name: /cancel this class/i }),
    );

    await waitFor(() => {
      expect(calendarActions.createCalendarEventAction).toHaveBeenCalledWith({
        eventType: "cancellation",
        eventDate: todayIso,
        startTime: "15:00",
        classId: classA.id,
      });
    });
    expect(onEventsChange).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith("Class cancelled for this date");
  });

  it("restores a cancelled occurrence", async () => {
    const user = userEvent.setup();
    vi.mocked(calendarActions.deleteCalendarEventAction).mockResolvedValue(
      undefined,
    );

    const { onEventsChange } = renderCalendar({
      slots: [{ classId: classA.id, day: todayWeekday, time: "15:00" }],
      events: [
        {
          id: "evt-cancel-1",
          event_type: "cancellation",
          event_date: todayIso,
          start_time: "15:00",
          end_time: null,
          class_id: classA.id,
          class_name: "Algebra II",
          student_id: null,
          student_name: null,
          contact_name: null,
          contact_phone: null,
          title: null,
          notes: null,
          created_at: "2026-08-01T00:00:00Z",
        },
      ],
    });

    await user.click(screen.getByRole("button", { name: /restore/i }));

    await waitFor(() => {
      expect(calendarActions.deleteCalendarEventAction).toHaveBeenCalledWith(
        "evt-cancel-1",
      );
    });
    expect(onEventsChange).toHaveBeenCalled();
  });

  it("adds a personal block via the Add menu", async () => {
    const user = userEvent.setup();
    const created: CalendarEvent = {
      id: "evt-block-1",
      event_type: "block",
      event_date: todayIso,
      start_time: null,
      end_time: null,
      class_id: null,
      class_name: null,
      student_id: null,
      student_name: null,
      contact_name: null,
      contact_phone: null,
      title: "Dentist",
      notes: null,
      created_at: "2026-08-01T00:00:00Z",
    };
    vi.mocked(calendarActions.createCalendarEventAction).mockResolvedValue(
      created,
    );

    const { onEventsChange } = renderCalendar();

    await user.click(screen.getByRole("button", { name: /^add$/i }));
    await user.click(screen.getByRole("menuitem", { name: /personal block/i }));
    await screen.findByRole("dialog");

    await user.type(screen.getByLabelText(/title/i), "Dentist");
    await user.click(screen.getByLabelText(/all day/i));
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(calendarActions.createCalendarEventAction).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: "block",
          title: "Dentist",
          startTime: null,
          endTime: null,
        }),
      );
    });
    expect(onEventsChange).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith("Personal block added");
  });

  it("warns about and cancels a scheduled lesson when a whole-day block covers it", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.mocked(calendarActions.createCalendarEventAction).mockImplementation(
      async (input) =>
        ({
          id:
            input.eventType === "block"
              ? "evt-holiday"
              : "evt-cancel-auto",
          event_type: input.eventType,
          event_date: input.eventDate,
          start_time: input.startTime ?? null,
          end_time: input.endTime ?? null,
          class_id: input.classId ?? null,
          class_name: input.eventType === "cancellation" ? "Algebra II" : null,
          student_id: null,
          student_name: null,
          contact_name: null,
          contact_phone: null,
          title: input.title ?? null,
          notes: null,
          created_at: "2026-08-01T00:00:00Z",
        }) as CalendarEvent,
    );

    const { onEventsChange } = renderCalendar({
      slots: [{ classId: classA.id, day: todayWeekday, time: "15:00" }],
    });

    await user.click(screen.getByRole("button", { name: /^add$/i }));
    await user.click(screen.getByRole("menuitem", { name: /personal block/i }));
    await screen.findByRole("dialog");

    await user.type(screen.getByLabelText(/title/i), "Holiday");
    await user.click(screen.getByLabelText(/all day/i));
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(calendarActions.createCalendarEventAction).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: "cancellation", classId: "class-1" }),
      );
    });
    expect(confirmSpy).toHaveBeenCalledWith(
      expect.stringContaining("15:00 Algebra II"),
    );
    expect(onEventsChange).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith(
      "Personal block added — cancelled 1 of 1 lessons",
    );

    confirmSpy.mockRestore();
  });

  it("creates nothing when the block-cancellation warning is declined", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

    renderCalendar({
      slots: [{ classId: classA.id, day: todayWeekday, time: "15:00" }],
    });

    await user.click(screen.getByRole("button", { name: /^add$/i }));
    await user.click(screen.getByRole("menuitem", { name: /personal block/i }));
    await screen.findByRole("dialog");

    await user.type(screen.getByLabelText(/title/i), "Holiday");
    await user.click(screen.getByLabelText(/all day/i));
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(confirmSpy).toHaveBeenCalled();
    });
    expect(calendarActions.createCalendarEventAction).not.toHaveBeenCalled();

    confirmSpy.mockRestore();
  });

  it("does not prompt for confirmation when no lessons fall on the block's day", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm");
    const created: CalendarEvent = {
      id: "evt-block-2",
      event_type: "block",
      event_date: todayIso,
      start_time: null,
      end_time: null,
      class_id: null,
      class_name: null,
      student_id: null,
      student_name: null,
      contact_name: null,
      contact_phone: null,
      title: "Dentist",
      notes: null,
      created_at: "2026-08-01T00:00:00Z",
    };
    vi.mocked(calendarActions.createCalendarEventAction).mockResolvedValue(
      created,
    );

    renderCalendar();

    await user.click(screen.getByRole("button", { name: /^add$/i }));
    await user.click(screen.getByRole("menuitem", { name: /personal block/i }));
    await screen.findByRole("dialog");

    await user.type(screen.getByLabelText(/title/i), "Dentist");
    await user.click(screen.getByLabelText(/all day/i));
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(calendarActions.createCalendarEventAction).toHaveBeenCalled();
    });
    expect(confirmSpy).not.toHaveBeenCalled();

    confirmSpy.mockRestore();
  });

  it("adds a one-off lesson for an existing student", async () => {
    const user = userEvent.setup();
    const created: CalendarEvent = {
      id: "evt-adhoc-1",
      event_type: "ad_hoc_lesson",
      event_date: todayIso,
      start_time: "16:00",
      end_time: null,
      class_id: null,
      class_name: null,
      student_id: studentA.id,
      student_name: "Ada Lovelace",
      contact_name: null,
      contact_phone: null,
      title: null,
      notes: null,
      created_at: "2026-08-01T00:00:00Z",
    };
    vi.mocked(calendarActions.createCalendarEventAction).mockResolvedValue(
      created,
    );

    renderCalendar();

    await user.click(screen.getByRole("button", { name: /^add$/i }));
    await user.click(screen.getByRole("menuitem", { name: /one-off lesson/i }));
    await screen.findByRole("dialog");

    await user.selectOptions(screen.getByLabelText(/student/i), studentA.id);
    await user.type(screen.getByLabelText(/start time/i), "16:00");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(calendarActions.createCalendarEventAction).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: "ad_hoc_lesson",
          studentId: studentA.id,
          startTime: "16:00",
        }),
      );
    });
  });

  it("edits an existing extra session, pre-filling the form", async () => {
    const user = userEvent.setup();
    const updated: CalendarEvent = {
      id: "evt-extra-1",
      event_type: "extra_session",
      event_date: todayIso,
      start_time: "18:00",
      end_time: null,
      class_id: classA.id,
      class_name: "Algebra II",
      student_id: null,
      student_name: null,
      contact_name: null,
      contact_phone: null,
      title: null,
      notes: "Moved earlier",
      created_at: "2026-08-01T00:00:00Z",
    };
    vi.mocked(calendarActions.updateCalendarEventAction).mockResolvedValue(
      updated,
    );

    renderCalendar({
      events: [
        {
          id: "evt-extra-1",
          event_type: "extra_session",
          event_date: todayIso,
          start_time: "17:00",
          end_time: null,
          class_id: classA.id,
          class_name: "Algebra II",
          student_id: null,
          student_name: null,
          contact_name: null,
          contact_phone: null,
          title: null,
          notes: null,
          created_at: "2026-08-01T00:00:00Z",
        },
      ],
    });

    await user.click(
      screen.getByRole("button", { name: /edit extra session/i }),
    );
    await screen.findByRole("dialog");

    expect(screen.getByLabelText(/start time/i)).toHaveValue("17:00");
  });

  it("reschedules today's recurring class to a new date and time", async () => {
    const user = userEvent.setup();
    const extraSession: CalendarEvent = {
      id: "evt-new",
      event_type: "extra_session",
      event_date: "2026-09-12",
      start_time: "11:00",
      end_time: null,
      class_id: classA.id,
      class_name: "Algebra II",
      student_id: null,
      student_name: null,
      contact_name: null,
      contact_phone: null,
      title: null,
      notes: null,
      created_at: "2026-08-01T00:00:00Z",
    };
    const cancellation: CalendarEvent = {
      ...extraSession,
      id: "evt-cancel",
      event_type: "cancellation",
      event_date: todayIso,
      start_time: "15:00",
    };
    vi.mocked(
      calendarActions.rescheduleClassOccurrenceAction,
    ).mockResolvedValue({ extraSession, cancellation });

    const { onEventsChange } = renderCalendar({
      slots: [{ classId: classA.id, day: todayWeekday, time: "15:00" }],
    });

    await user.click(screen.getByRole("button", { name: /^reschedule$/i }));
    const dialog = await screen.findByRole("dialog");

    const dateInput = screen.getByLabelText(/new date/i);
    await user.clear(dateInput);
    await user.type(dateInput, "2026-09-12");
    const startInput = screen.getByLabelText(/new start time/i);
    await user.clear(startInput);
    await user.type(startInput, "11:00");
    await user.click(
      within(dialog).getByRole("button", { name: /^reschedule$/i }),
    );

    await waitFor(() => {
      expect(
        calendarActions.rescheduleClassOccurrenceAction,
      ).toHaveBeenCalledWith({
        classId: classA.id,
        fromDate: todayIso,
        fromStartTime: "15:00",
        toDate: "2026-09-12",
        toStartTime: "11:00",
        toEndTime: null,
      });
    });
    expect(onEventsChange).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith("Rescheduled");
  });

  it("reschedules a stored extra session by updating its date/time only", async () => {
    const user = userEvent.setup();
    const updated: CalendarEvent = {
      id: "evt-extra-1",
      event_type: "extra_session",
      event_date: "2026-09-12",
      start_time: "11:00",
      end_time: null,
      class_id: classA.id,
      class_name: "Algebra II",
      student_id: null,
      student_name: null,
      contact_name: null,
      contact_phone: null,
      title: null,
      notes: null,
      created_at: "2026-08-01T00:00:00Z",
    };
    vi.mocked(calendarActions.updateCalendarEventAction).mockResolvedValue(
      updated,
    );

    renderCalendar({
      events: [
        {
          id: "evt-extra-1",
          event_type: "extra_session",
          event_date: todayIso,
          start_time: "17:00",
          end_time: null,
          class_id: classA.id,
          class_name: "Algebra II",
          student_id: null,
          student_name: null,
          contact_name: null,
          contact_phone: null,
          title: null,
          notes: null,
          created_at: "2026-08-01T00:00:00Z",
        },
      ],
    });

    await user.click(
      screen.getByRole("button", { name: /reschedule extra session/i }),
    );
    const dialog = await screen.findByRole("dialog");

    const startInput = screen.getByLabelText(/new start time/i);
    await user.clear(startInput);
    await user.type(startInput, "11:00");
    await user.click(
      within(dialog).getByRole("button", { name: /^reschedule$/i }),
    );

    await waitFor(() => {
      expect(calendarActions.updateCalendarEventAction).toHaveBeenCalledWith(
        "evt-extra-1",
        expect.objectContaining({
          eventType: "extra_session",
          classId: classA.id,
          startTime: "11:00",
        }),
      );
    });
  });
});

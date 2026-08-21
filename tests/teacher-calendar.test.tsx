import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { TeacherCalendar } from "@/components/teacher-calendar";
import * as calendarActions from "@/app/protected/teacher/calendar-actions";
import { toIsoDate, weekdayLabelFromDate } from "@/lib/calendar-projection";
import type { CalendarEvent } from "@/lib/types/database";

vi.mock("@/app/protected/teacher/calendar-actions", () => ({
  createCalendarEventAction: vi.fn(),
  updateCalendarEventAction: vi.fn(),
  deleteCalendarEventAction: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const todayIso = toIsoDate(new Date());
const todayWeekday = weekdayLabelFromDate(new Date());

const classA = { id: "class-1", name: "Algebra II", archivedAt: null };
const studentA = { id: "student-1", firstName: "Ada", lastName: "Lovelace" };

function renderCalendar(overrides: {
  events?: CalendarEvent[];
  slots?: Array<{ classId: string; day: string; time: string }>;
} = {}) {
  const events = overrides.events ?? [];
  const onEventsChange = vi.fn();
  render(
    <TeacherCalendar
      events={events}
      onEventsChange={onEventsChange}
      classes={[classA]}
      students={[studentA]}
      slots={overrides.slots ?? []}
    />,
  );
  return { onEventsChange };
}

describe("TeacherCalendar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows a nothing-scheduled message for a day with no occurrences", () => {
    renderCalendar();
    expect(screen.getByText("Nothing scheduled.")).toBeInTheDocument();
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
});

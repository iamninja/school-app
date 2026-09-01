import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TeacherCalendar } from "@/components/teacher-calendar";
import * as teacherActions from "@/app/protected/teacher/actions";
import { toIsoDate, weekdayLabelFromDate } from "@/lib/calendar-projection";
import type { CalendarEvent } from "@/lib/types/database";
import type { AttendanceRecord } from "@/lib/attendance-records";

vi.mock("@/app/protected/teacher/calendar-actions", () => ({
  createCalendarEventAction: vi.fn(),
  updateCalendarEventAction: vi.fn(),
  deleteCalendarEventAction: vi.fn(),
  rescheduleClassOccurrenceAction: vi.fn(),
}));

vi.mock("@/app/protected/teacher/actions", () => ({
  setAttendanceAction: vi.fn(),
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
  assignedClassIds: [classA.id, classB.id],
};

function renderCalendar(overrides: {
  events?: CalendarEvent[];
  slots?: Array<{
    classId: string;
    day: string;
    time: string;
    isTwoHour?: boolean;
  }>;
  classes?: Array<{ id: string; name: string; archivedAt: string | null }>;
  attendanceRecords?: AttendanceRecord[];
} = {}) {
  const onAttendanceRecordsChange = vi.fn();
  render(
    <TeacherCalendar
      events={overrides.events ?? []}
      onEventsChange={vi.fn()}
      classes={overrides.classes ?? [classA]}
      students={[studentA]}
      slots={overrides.slots ?? []}
      attendanceRecords={overrides.attendanceRecords ?? []}
      onAttendanceRecordsChange={onAttendanceRecordsChange}
    />,
  );
  return { onAttendanceRecordsChange };
}

function attendanceCard() {
  return screen.getByText(/^attendance —/i).closest(".rounded-2xl") as HTMLElement;
}

describe("TeacherCalendar attendance section", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows nothing-scheduled when the day has no lessons", () => {
    renderCalendar();
    expect(
      within(attendanceCard()).getByText("Nothing scheduled."),
    ).toBeInTheDocument();
  });

  it("shows a tab with the class's roster for a recurring lesson today", () => {
    renderCalendar({
      slots: [{ classId: classA.id, day: todayWeekday, time: "15:00" }],
    });

    const card = attendanceCard();
    expect(
      within(card).getByRole("tab", { name: /algebra ii/i }),
    ).toBeInTheDocument();
    expect(within(card).getByText("Ada Lovelace")).toBeInTheDocument();
    expect(
      within(card).getByRole("button", { name: "Present" }),
    ).toBeInTheDocument();
  });

  it("does not show a tab for a cancelled occurrence", () => {
    renderCalendar({
      slots: [{ classId: classA.id, day: todayWeekday, time: "15:00" }],
      events: [
        {
          id: "evt-cancel-1",
          event_type: "cancellation",
          event_date: todayIso,
          start_time: null,
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

    expect(
      within(attendanceCard()).getByText("Nothing scheduled."),
    ).toBeInTheDocument();
  });

  it("does not show a tab for a trial lesson or a personal block", () => {
    renderCalendar({
      events: [
        {
          id: "evt-trial-1",
          event_type: "trial_lesson",
          event_date: todayIso,
          start_time: "16:00",
          end_time: null,
          class_id: null,
          class_name: null,
          student_id: null,
          student_name: null,
          contact_name: "Prospective Family",
          contact_phone: null,
          title: null,
          notes: null,
          created_at: "2026-08-01T00:00:00Z",
        },
      ],
    });

    expect(
      within(attendanceCard()).getByText("Nothing scheduled."),
    ).toBeInTheDocument();
  });

  it("shows one tab, not two, when a class meets twice the same day", () => {
    renderCalendar({
      slots: [{ classId: classA.id, day: todayWeekday, time: "15:00" }],
      events: [
        {
          id: "evt-extra-1",
          event_type: "extra_session",
          event_date: todayIso,
          start_time: "19:00",
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

    expect(
      within(attendanceCard()).getAllByRole("tab", { name: /algebra ii/i }),
    ).toHaveLength(1);
  });

  it("only shows the 1+1 option for a two-hour lesson", async () => {
    const user = userEvent.setup();
    renderCalendar({
      classes: [classA, classB],
      slots: [
        { classId: classA.id, day: todayWeekday, time: "15:00" },
        {
          classId: classB.id,
          day: todayWeekday,
          time: "17:00",
          isTwoHour: true,
        },
      ],
    });

    const card = attendanceCard();
    expect(
      within(card).queryByRole("button", { name: "1+1" }),
    ).not.toBeInTheDocument();

    await user.click(within(card).getByRole("tab", { name: /geometry/i }));

    expect(
      within(card).getByRole("button", { name: "1+1" }),
    ).toBeInTheDocument();
  });

  it("marks a student present and reports it up through onAttendanceRecordsChange", async () => {
    const user = userEvent.setup();
    const setAttendanceAction = vi.mocked(teacherActions.setAttendanceAction);
    setAttendanceAction.mockResolvedValue({
      studentId: studentA.id,
      status: "present",
    });

    const { onAttendanceRecordsChange } = renderCalendar({
      slots: [{ classId: classA.id, day: todayWeekday, time: "15:00" }],
    });

    await user.click(
      within(attendanceCard()).getByRole("button", { name: "Present" }),
    );

    await waitFor(() => {
      expect(setAttendanceAction).toHaveBeenCalledWith({
        classId: classA.id,
        className: "Algebra II",
        studentId: studentA.id,
        attendanceDate: todayIso,
        status: "present",
      });
    });
    expect(onAttendanceRecordsChange).toHaveBeenCalled();
  });
});

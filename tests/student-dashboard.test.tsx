/// <reference types="vitest/globals" />

import { render, screen, within } from "@testing-library/react";
import { vi } from "vitest";
import { addDays, format } from "date-fns";
import { StudentDashboard } from "@/components/student-dashboard";

const signOut = vi.fn();
const push = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { signOut },
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

const baseProps = {
  student: {
    id: "student-1",
    firstName: "Maya",
    lastName: "Carter",
    gradeLevel: "10",
    email: "maya@example.com",
    tuitionAmount: 420,
    tuitionStatus: "current",
  },
  parents: [],
  classes: [
    { id: "class-1", name: "Algebra II", hoursPerWeek: 3, archivedAt: null },
  ],
  schedules: [],
  attendance: [],
  quizzes: [],
  calendarEvents: [],
};

describe("StudentDashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the student's name", () => {
    render(<StudentDashboard {...baseProps} />);
    expect(screen.getAllByText(/maya carter/i).length).toBeGreaterThan(0);
  });

  it("shows the live class name for an attendance record whose class still exists", () => {
    render(
      <StudentDashboard
        {...baseProps}
        attendance={[
          {
            class_id: "class-1",
            class_name: "stale snapshot, should be ignored",
            attendance_date: "2026-01-05",
            status: "present",
          },
        ]}
      />,
    );

    const attendanceCard = screen
      .getByText("Πρόσφατες καταγραφές")
      .closest(".rounded-2xl") as HTMLElement;
    expect(within(attendanceCard).getByText("Algebra II")).toBeInTheDocument();
    expect(
      within(attendanceCard).queryByText("stale snapshot, should be ignored"),
    ).not.toBeInTheDocument();
  });

  it("falls back to the snapshotted class name for a deleted class's attendance record", () => {
    render(
      <StudentDashboard
        {...baseProps}
        classes={[]}
        attendance={[
          {
            class_id: null,
            class_name: "Old Trigonometry",
            attendance_date: "2026-01-05",
            status: "present",
          },
        ]}
      />,
    );

    expect(screen.getByText("Old Trigonometry")).toBeInTheDocument();
  });

  it("shows an upcoming cancellation with its Greek label", () => {
    render(
      <StudentDashboard
        {...baseProps}
        calendarEvents={[
          {
            id: "evt-1",
            event_type: "cancellation",
            event_date: format(addDays(new Date(), 3), "yyyy-MM-dd"),
            start_time: "15:00",
            end_time: null,
            class_id: "class-1",
            class_name: "Algebra II",
            notes: null,
          },
        ]}
      />,
    );

    const upcomingCard = screen
      .getByText("Επόμενα μαθήματα")
      .closest(".rounded-2xl") as HTMLElement;
    expect(within(upcomingCard).getByText("Ακύρωση")).toBeInTheDocument();
  });
});

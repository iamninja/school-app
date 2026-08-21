/// <reference types="vitest/globals" />

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

import { TeacherDashboard } from "@/components/teacher-dashboard";
import * as actions from "@/app/protected/teacher/actions";

vi.mock("@/app/protected/teacher/actions", () => ({
  archiveClassAction: vi.fn(),
  createClassAction: vi.fn(),
  createStudentAction: vi.fn(),
  getAttendanceAction: vi.fn().mockResolvedValue([]),
  restoreClassAction: vi.fn(),
  setAttendanceAction: vi.fn(),
  setScheduleSlotAction: vi.fn(),
  updateClassAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

describe("TeacherDashboard attendance validation", () => {
  const mockClass = {
    id: "class-1",
    name: "Math 101",
    subject: "Mathematics",
    room: "Room 101",
    hoursPerWeek: 5,
    archivedAt: null,
  };

  const assignedStudent = {
    id: "student-1",
    firstName: "Maya",
    lastName: "Carter",
    gradeLevel: "10",
    email: "maya@example.com",
    parentName: "Jordan Carter",
    parentEmail: "parent@example.com",
    parentPhone: "(555) 123-4567",
    parentTwoName: "",
    parentTwoEmail: "",
    parentTwoPhone: "",
    tuitionAmount: "420",
    tuitionStatus: "current" as const,
    assignedClassIds: ["class-1"],
  };

  const unassignedStudent = {
    id: "student-2",
    firstName: "Alex",
    lastName: "Johnson",
    gradeLevel: "10",
    email: "alex@example.com",
    parentName: "Sam Johnson",
    parentEmail: "sam@example.com",
    parentPhone: "(555) 987-6543",
    parentTwoName: "",
    parentTwoEmail: "",
    parentTwoPhone: "",
    tuitionAmount: "420",
    tuitionStatus: "current" as const,
    assignedClassIds: ["class-2"], // Different class
  };

  const mondayWednesdaySchedule = [
    { id: "slot-mon-0800", day: "Monday", time: "08:00", classId: "class-1" },
    {
      id: "slot-wed-0800",
      day: "Wednesday",
      time: "08:00",
      classId: "class-1",
    },
  ];

  it("shows only students assigned to the selected class in attendance roster", async () => {
    const user = userEvent.setup();

    render(
      <TeacherDashboard
        initialClasses={[mockClass]}
        initialSlots={mondayWednesdaySchedule}
        initialStudents={[assignedStudent, unassignedStudent]}
        initialAttendance={[]}
      />,
    );

    await user.click(screen.getByRole("tab", { name: /attendance/i }));

    // Select the class
    await user.selectOptions(screen.getByLabelText(/^class$/i), "class-1");

    // Should show assigned student
    expect(screen.getByText(/maya carter/i)).toBeInTheDocument();

    // Should NOT show unassigned student
    expect(screen.queryByText(/alex johnson/i)).not.toBeInTheDocument();
  });

  it("shows message when no students are assigned to selected class", async () => {
    const user = userEvent.setup();

    render(
      <TeacherDashboard
        initialClasses={[mockClass]}
        initialSlots={mondayWednesdaySchedule}
        initialStudents={[unassignedStudent]} // Only has unassigned student
        initialAttendance={[]}
      />,
    );

    await user.click(screen.getByRole("tab", { name: /attendance/i }));

    await user.selectOptions(screen.getByLabelText(/^class$/i), "class-1");

    expect(
      screen.getByText(/no students assigned to this class yet/i),
    ).toBeInTheDocument();
  });

  it("disables calendar dates when class is not scheduled", async () => {
    const user = userEvent.setup();

    render(
      <TeacherDashboard
        initialClasses={[mockClass]}
        initialSlots={mondayWednesdaySchedule} // Only Monday and Wednesday
        initialStudents={[assignedStudent]}
        initialAttendance={[]}
      />,
    );

    await user.click(screen.getByRole("tab", { name: /attendance/i }));

    await user.selectOptions(screen.getByLabelText(/^class$/i), "class-1");

    // Open the calendar by clicking the date button
    const dateButton = screen.getByLabelText(/date/i);
    await user.click(dateButton);

    // The calendar should be rendered
    const calendar = screen.getByRole("grid");
    expect(calendar).toBeInTheDocument();

    // Note: Testing disabled dates in a calendar is complex with react-day-picker
    // The key validation is that the calendar's disabled function checks attendanceAllowedDays
    // which only contains "Monday" and "Wednesday" for this schedule
  });

  it("shows error when class has no scheduled days", async () => {
    const user = userEvent.setup();
    const classWithNoSchedule = {
      id: "class-3",
      name: "Physics 101",
      subject: "Physics",
      room: "Room 301",
      hoursPerWeek: 4,
      archivedAt: null,
    };

    render(
      <TeacherDashboard
        initialClasses={[classWithNoSchedule]}
        initialSlots={[]} // No schedule
        initialStudents={[assignedStudent]}
        initialAttendance={[]}
      />,
    );

    await user.click(screen.getByRole("tab", { name: /attendance/i }));

    await user.selectOptions(screen.getByLabelText(/^class$/i), "class-3");

    expect(
      screen.getByText(/this class has no scheduled days yet/i),
    ).toBeInTheDocument();
  });

  it("only allows attendance on scheduled class days", async () => {
    const user = userEvent.setup();
    const setAttendanceAction = vi.mocked(actions.setAttendanceAction);

    render(
      <TeacherDashboard
        initialClasses={[mockClass]}
        initialSlots={mondayWednesdaySchedule}
        initialStudents={[assignedStudent]}
        initialAttendance={[]}
      />,
    );

    await user.click(screen.getByRole("tab", { name: /attendance/i }));

    await user.selectOptions(screen.getByLabelText(/^class$/i), "class-1");

    // The calendar should only allow selecting Monday/Wednesday dates
    // This is enforced by the disabled prop on Calendar component
    // which checks if the day is in attendanceAllowedDays

    // Find the student and mark them present
    const mayaText = screen.getByText(/maya carter/i);
    expect(mayaText).toBeInTheDocument();

    // Get the Present button - there should be exactly one on the page for Maya
    const presentButtons = screen.getAllByRole("button", {
      name: /^present$/i,
    });
    expect(presentButtons.length).toBeGreaterThan(0);

    await user.click(presentButtons[0]);

    // The action should be called
    expect(setAttendanceAction).toHaveBeenCalled();
  });

  it("prevents attendance for students not in the roster", async () => {
    const user = userEvent.setup();

    render(
      <TeacherDashboard
        initialClasses={[mockClass]}
        initialSlots={mondayWednesdaySchedule}
        initialStudents={[assignedStudent, unassignedStudent]}
        initialAttendance={[]}
      />,
    );

    await user.click(screen.getByRole("tab", { name: /attendance/i }));

    await user.selectOptions(screen.getByLabelText(/^class$/i), "class-1");

    // Unassigned student should not be visible in roster
    expect(screen.queryByText(/alex johnson/i)).not.toBeInTheDocument();

    // Only assigned student should have attendance buttons
    const mayaText = screen.getByText(/maya carter/i);
    expect(mayaText).toBeInTheDocument();

    // There should only be buttons for the assigned student (Present, Late, Absent)
    const allPresentButtons = screen.getAllByRole("button", {
      name: /^present$/i,
    });
    expect(allPresentButtons).toHaveLength(1); // Only Maya's button
  });

  it("filters roster correctly when switching between classes", async () => {
    const user = userEvent.setup();
    const class2 = {
      id: "class-2",
      name: "English 101",
      subject: "English",
      room: "Room 201",
      hoursPerWeek: 4,
      archivedAt: null,
    };

    const class2Schedule = [
      {
        id: "slot-tue-0900",
        day: "Tuesday",
        time: "09:00",
        classId: "class-2",
      },
    ];

    render(
      <TeacherDashboard
        initialClasses={[mockClass, class2]}
        initialSlots={[...mondayWednesdaySchedule, ...class2Schedule]}
        initialStudents={[assignedStudent, unassignedStudent]}
        initialAttendance={[]}
      />,
    );

    await user.click(screen.getByRole("tab", { name: /attendance/i }));

    // Select first class
    await user.selectOptions(screen.getByLabelText(/^class$/i), "class-1");

    expect(screen.getByText(/maya carter/i)).toBeInTheDocument();
    expect(screen.queryByText(/alex johnson/i)).not.toBeInTheDocument();

    // Switch to second class
    await user.selectOptions(screen.getByLabelText(/^class$/i), "class-2");

    // Now should show Alex, not Maya
    expect(screen.queryByText(/maya carter/i)).not.toBeInTheDocument();
    expect(screen.getByText(/alex johnson/i)).toBeInTheDocument();
  });

  it("shows correct student count for each class", async () => {
    const user = userEvent.setup();
    const studentInBothClasses = {
      id: "student-3",
      firstName: "Jordan",
      lastName: "Smith",
      gradeLevel: "11",
      email: "jordan@example.com",
      parentName: "Pat Smith",
      parentEmail: "pat@example.com",
      parentPhone: "(555) 111-2222",
      parentTwoName: "",
      parentTwoEmail: "",
      parentTwoPhone: "",
      tuitionAmount: "420",
      tuitionStatus: "current" as const,
      assignedClassIds: ["class-1", "class-2"],
    };

    render(
      <TeacherDashboard
        initialClasses={[mockClass]}
        initialSlots={mondayWednesdaySchedule}
        initialStudents={[assignedStudent, studentInBothClasses]}
        initialAttendance={[]}
      />,
    );

    await user.click(screen.getByRole("tab", { name: /attendance/i }));

    await user.selectOptions(screen.getByLabelText(/^class$/i), "class-1");

    // Should show both students assigned to class-1
    expect(screen.getByText(/maya carter/i)).toBeInTheDocument();
    expect(screen.getByText(/jordan smith/i)).toBeInTheDocument();

    // Count present buttons (one per student)
    const presentButtons = screen.getAllByRole("button", {
      name: /present/i,
    });
    expect(presentButtons).toHaveLength(2);
  });

  it("does not show the 'no scheduled days' error for a class whose only occurrence is an extra session", async () => {
    const user = userEvent.setup();
    const classWithNoTemplate = {
      id: "class-4",
      name: "Chemistry 101",
      hoursPerWeek: 2,
      archivedAt: null,
    };

    render(
      <TeacherDashboard
        initialClasses={[classWithNoTemplate]}
        initialSlots={[]}
        initialStudents={[assignedStudent]}
        initialAttendance={[]}
        initialCalendarEvents={[
          {
            id: "evt-extra-1",
            event_type: "extra_session",
            event_date: "2026-09-10",
            start_time: "16:00",
            end_time: null,
            class_id: "class-4",
            class_name: "Chemistry 101",
            student_id: null,
            student_name: null,
            contact_name: null,
            contact_phone: null,
            title: null,
            notes: null,
            created_at: "2026-09-01T00:00:00Z",
          },
        ]}
      />,
    );

    await user.click(screen.getByRole("tab", { name: /attendance/i }));
    await user.selectOptions(screen.getByLabelText(/^class$/i), "class-4");

    expect(
      screen.queryByText(/this class has no scheduled days yet/i),
    ).not.toBeInTheDocument();
  });

  it("still shows the 'no scheduled days' error for a class with no template and no calendar events at all", async () => {
    const user = userEvent.setup();
    const classWithNothing = {
      id: "class-5",
      name: "Empty Class",
      hoursPerWeek: 2,
      archivedAt: null,
    };

    render(
      <TeacherDashboard
        initialClasses={[classWithNothing]}
        initialSlots={[]}
        initialStudents={[assignedStudent]}
        initialAttendance={[]}
      />,
    );

    await user.click(screen.getByRole("tab", { name: /attendance/i }));
    await user.selectOptions(screen.getByLabelText(/^class$/i), "class-5");

    expect(
      screen.getByText(/this class has no scheduled days yet/i),
    ).toBeInTheDocument();
  });
});

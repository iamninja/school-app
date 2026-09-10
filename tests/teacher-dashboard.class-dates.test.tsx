/// <reference types="vitest/globals" />

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { toast } from "sonner";

import { TeacherDashboard } from "@/components/teacher-dashboard";
import * as actions from "@/app/protected/teacher/actions";

vi.mock("@/app/protected/teacher/actions", () => ({
  archiveClassAction: vi.fn(),
  createClassAction: vi.fn(),
  createStudentAction: vi.fn(),
  deleteClassAction: vi.fn(),
  enrollStudentInClassAction: vi.fn(),
  getAttendanceAction: vi.fn().mockResolvedValue([]),
  restoreClassAction: vi.fn(),
  restoreStudentAction: vi.fn(),
  setAttendanceAction: vi
    .fn()
    .mockResolvedValue({ studentId: "", status: "", chargedAmount: null }),
  setScheduleSlotAction: vi.fn(),
  unenrollStudentFromClassAction: vi.fn(),
  updateClassAction: vi.fn(),
  withdrawStudentAction: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const baseProps = {
  initialClasses: [
    {
      id: "class-1",
      name: "Algebra II",
      hoursPerWeek: 3,
      grade: null,
      archivedAt: null,
      startDate: "2026-09-01",
      finishDate: "2027-06-15",
    },
  ],
  initialSlots: [],
  initialStudents: [],
  initialAttendance: [],
};

describe("TeacherDashboard class start/finish dates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a class with a start and finish date", async () => {
    const user = userEvent.setup();
    vi.mocked(actions.createClassAction).mockResolvedValue({
      id: "class-new",
      name: "Physics",
      hoursPerWeek: 2,
      grade: null,
      startDate: "2026-10-01",
      finishDate: "2027-05-30",
      billingType: "monthly",
      lessonRate: null,
    });

    render(<TeacherDashboard {...baseProps} initialClasses={[]} />);
    await user.click(screen.getByRole("tab", { name: /classes/i }));
    await user.click(screen.getByRole("button", { name: /add class/i }));
    await screen.findByRole("dialog");

    await user.type(screen.getByLabelText(/class name/i), "Physics");
    await user.type(screen.getByLabelText(/start date/i), "2026-10-01");
    await user.type(screen.getByLabelText(/finish date/i), "2027-05-30");
    await user.click(screen.getByRole("button", { name: /create class/i }));

    await waitFor(() => {
      expect(actions.createClassAction).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Physics",
          startDate: "2026-10-01",
          finishDate: "2027-05-30",
        }),
      );
    });
  });

  it("creates a class with no dates set as null", async () => {
    const user = userEvent.setup();
    vi.mocked(actions.createClassAction).mockResolvedValue({
      id: "class-new",
      name: "Chemistry",
      hoursPerWeek: 2,
      grade: null,
      startDate: null,
      finishDate: null,
      billingType: "monthly",
      lessonRate: null,
    });

    render(<TeacherDashboard {...baseProps} initialClasses={[]} />);
    await user.click(screen.getByRole("tab", { name: /classes/i }));
    await user.click(screen.getByRole("button", { name: /add class/i }));
    await screen.findByRole("dialog");

    await user.type(screen.getByLabelText(/class name/i), "Chemistry");
    await user.click(screen.getByRole("button", { name: /create class/i }));

    await waitFor(() => {
      expect(actions.createClassAction).toHaveBeenCalledWith(
        expect.objectContaining({ startDate: null, finishDate: null }),
      );
    });
  });

  it("pre-fills the start/finish dates when editing a class, and updates them", async () => {
    const user = userEvent.setup();
    vi.mocked(actions.updateClassAction).mockResolvedValue({
      id: "class-1",
      name: "Algebra II",
      hoursPerWeek: 3,
      grade: null,
      startDate: "2026-09-15",
      finishDate: "2027-06-15",
      billingType: "monthly",
      lessonRate: null,
      billingWarning: null,
    });

    render(<TeacherDashboard {...baseProps} />);
    await user.click(screen.getByRole("tab", { name: /classes/i }));
    await user.click(screen.getByRole("button", { name: /^edit$/i }));
    await screen.findByRole("dialog");

    const startInput = screen.getByLabelText(/start date/i);
    expect(startInput).toHaveValue("2026-09-01");

    await user.clear(startInput);
    await user.type(startInput, "2026-09-15");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(actions.updateClassAction).toHaveBeenCalledWith(
        expect.objectContaining({
          classId: "class-1",
          startDate: "2026-09-15",
          finishDate: "2027-06-15",
        }),
      );
    });
  });

  it("shows a warning toast when the server flags a billing mismatch after saving", async () => {
    const user = userEvent.setup();
    vi.mocked(actions.updateClassAction).mockResolvedValue({
      id: "class-1",
      name: "Algebra II",
      hoursPerWeek: 3,
      grade: null,
      startDate: "2026-09-01",
      finishDate: "2027-06-15",
      billingType: "per_lesson",
      lessonRate: 20,
      billingWarning:
        "Still has a monthly tuition set — clear it to avoid double-charging: Giannis Verify",
    });

    render(<TeacherDashboard {...baseProps} />);
    await user.click(screen.getByRole("tab", { name: /classes/i }));
    await user.click(screen.getByRole("button", { name: /^edit$/i }));
    await screen.findByRole("dialog");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(toast.warning).toHaveBeenCalledWith(
        "Still has a monthly tuition set — clear it to avoid double-charging: Giannis Verify",
      );
    });
  });

  it("does not show a warning toast when there's no billing mismatch", async () => {
    const user = userEvent.setup();
    vi.mocked(actions.updateClassAction).mockResolvedValue({
      id: "class-1",
      name: "Algebra II",
      hoursPerWeek: 3,
      grade: null,
      startDate: "2026-09-01",
      finishDate: "2027-06-15",
      billingType: "monthly",
      lessonRate: null,
      billingWarning: null,
    });

    render(<TeacherDashboard {...baseProps} />);
    await user.click(screen.getByRole("tab", { name: /classes/i }));
    await user.click(screen.getByRole("button", { name: /^edit$/i }));
    await screen.findByRole("dialog");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(actions.updateClassAction).toHaveBeenCalled();
    });
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it("blocks saving when the finish date is before the start date", async () => {
    const user = userEvent.setup();

    render(<TeacherDashboard {...baseProps} initialClasses={[]} />);
    await user.click(screen.getByRole("tab", { name: /classes/i }));
    await user.click(screen.getByRole("button", { name: /add class/i }));
    await screen.findByRole("dialog");

    await user.type(screen.getByLabelText(/class name/i), "Physics");
    await user.type(screen.getByLabelText(/start date/i), "2026-10-01");
    await user.type(screen.getByLabelText(/finish date/i), "2026-09-01");
    await user.click(screen.getByRole("button", { name: /create class/i }));

    expect(actions.createClassAction).not.toHaveBeenCalled();
  });
});

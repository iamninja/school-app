/// <reference types="vitest/globals" />

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { toast } from "sonner";

import { LessonAttendance } from "@/components/teacher-app/lesson-attendance";
import { setAttendanceAction } from "@/app/protected/teacher/actions";

vi.mock("@/app/protected/teacher/actions", () => ({
  setAttendanceAction: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

const ROSTER = [
  { id: "s1", firstName: "Maya", lastName: "Carter", gradeLevel: "B" },
  { id: "s2", firstName: "Nikos", lastName: "Papas", gradeLevel: "B" },
  { id: "s3", firstName: "Eleni", lastName: "Dima", gradeLevel: "B" },
];

function renderAttendance(
  props: Partial<React.ComponentProps<typeof LessonAttendance>> = {},
) {
  return render(
    <LessonAttendance
      classId="class-1"
      className="Algebra"
      date="2026-10-14"
      isTwoHour={false}
      isPerLesson={false}
      roster={ROSTER}
      initialMarks={{}}
      {...props}
    />,
  );
}

function card(name: string) {
  return within(screen.getByRole("group", { name: `Attendance for ${name}` }));
}

describe("LessonAttendance", () => {
  beforeEach(() => {
    vi.mocked(setAttendanceAction).mockReset();
    vi.mocked(setAttendanceAction).mockImplementation(
      async (data) =>
        ({
          studentId: data.studentId,
          status: data.status,
          chargedAmount: data.status === "present" ? 12 : null,
        }) as Awaited<ReturnType<typeof setAttendanceAction>>,
    );
    vi.mocked(toast.error).mockReset();
  });

  it("saves a status and shows it as pressed", async () => {
    renderAttendance();

    await userEvent.click(card("Maya Carter").getByRole("button", { name: "Absent" }));

    expect(setAttendanceAction).toHaveBeenCalledWith({
      classId: "class-1",
      className: "Algebra",
      studentId: "s1",
      attendanceDate: "2026-10-14",
      status: "absent",
    });
    expect(card("Maya Carter").getByRole("button", { name: "Absent" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByText(/1\/3 marked · 1 absent/)).toBeInTheDocument();
  });

  it("clears a status when its button is tapped again", async () => {
    renderAttendance({ initialMarks: { s1: { status: "late", chargedAmount: null } } });

    await userEvent.click(card("Maya Carter").getByRole("button", { name: "Late" }));

    expect(setAttendanceAction).toHaveBeenCalledWith(expect.objectContaining({ status: "" }));
    expect(card("Maya Carter").getByRole("button", { name: "Late" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("rolls back and shows an error when the save fails", async () => {
    vi.mocked(setAttendanceAction).mockRejectedValueOnce(new Error("boom"));
    renderAttendance({ initialMarks: { s1: { status: "late", chargedAmount: null } } });

    await userEvent.click(card("Maya Carter").getByRole("button", { name: "Present" }));

    expect(card("Maya Carter").getByRole("button", { name: "Late" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(toast.error).toHaveBeenCalled();
  });

  it("offers 1+1 only on two-hour lessons", () => {
    const { unmount } = renderAttendance();
    expect(card("Maya Carter").queryByRole("button", { name: "1+1" })).toBeNull();
    unmount();

    renderAttendance({ isTwoHour: true });
    expect(card("Maya Carter").getByRole("button", { name: "1+1" })).toBeInTheDocument();
  });

  it("marks only the unmarked students present", async () => {
    renderAttendance({ initialMarks: { s2: { status: "absent", chargedAmount: null } } });

    await userEvent.click(screen.getByRole("button", { name: /Mark the rest present/ }));

    expect(vi.mocked(setAttendanceAction).mock.calls.map(([data]) => data.studentId)).toEqual([
      "s1",
      "s3",
    ]);
    expect(card("Nikos Papas").getByRole("button", { name: "Absent" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.queryByRole("button", { name: /Mark the rest present/ })).toBeNull();
  });

  it("shows the posted charge on per-lesson classes", async () => {
    renderAttendance({ isPerLesson: true });

    await userEvent.click(card("Maya Carter").getByRole("button", { name: "Present" }));

    expect(await screen.findByText(/12,00\s€ charged|€12\.00 charged/)).toBeInTheDocument();
  });
});

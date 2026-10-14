/// <reference types="vitest/globals" />

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { toast } from "sonner";

import { LessonAttendance } from "@/components/teacher-app/lesson-attendance";
import { setAttendanceAction } from "@/app/protected/teacher/actions";
import {
  __resetAttendanceQueueForTests,
  getQueueSnapshot,
} from "@/lib/teacher-app/attendance-queue";

vi.mock("@/app/protected/teacher/actions", () => ({
  setAttendanceAction: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

const ROSTER = [
  {
    id: "s1",
    firstName: "Maya",
    lastName: "Carter",
    gradeLevel: "B",
    contacts: [
      { name: "Anna Carter", role: "parent" as const, phone: "+306912345678" },
      { name: "Home", role: "parent" as const, phone: "+302441012345" },
    ],
  },
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
    window.localStorage.clear();
    __resetAttendanceQueueForTests();
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

  it("lists the family's numbers with call and message links", async () => {
    renderAttendance();

    expect(
      screen.queryByRole("button", { name: "Contact Nikos Papas's family" }),
    ).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Contact Maya Carter's family" }));

    expect(await screen.findByText("+30 691 234 5678")).toBeInTheDocument();
    const links = screen.getAllByRole("menuitem").map((item) => item.getAttribute("href"));
    expect(links).toEqual([
      "tel:+306912345678",
      "sms:+306912345678",
      "viber://chat?number=%2B306912345678",
      "https://wa.me/306912345678",
      "tel:+302441012345",
    ]);
  });

  it("keeps a mark that couldn't reach the server and queues it", async () => {
    vi.mocked(setAttendanceAction).mockRejectedValueOnce(new TypeError("Failed to fetch"));
    renderAttendance();

    await userEvent.click(card("Maya Carter").getByRole("button", { name: "Absent" }));

    expect(card("Maya Carter").getByRole("button", { name: "Absent" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByText("Waiting for signal")).toBeInTheDocument();
    expect(toast.error).not.toHaveBeenCalled();
    expect(getQueueSnapshot()).toEqual([
      expect.objectContaining({ studentId: "s1", status: "absent", studentName: "Maya Carter" }),
    ]);
  });

  it("queues straight away when the phone is offline", async () => {
    const onLine = vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    renderAttendance();

    await userEvent.click(card("Nikos Papas").getByRole("button", { name: "Present" }));

    expect(setAttendanceAction).not.toHaveBeenCalled();
    expect(getQueueSnapshot()).toEqual([expect.objectContaining({ studentId: "s2", status: "present" })]);
    onLine.mockRestore();
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ParentDashboard } from "@/components/parent-dashboard";

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
  parent: {
    id: "parent-1",
    name: "Jane Doe",
    email: "jane@example.com",
    phone: "555-1234",
    isPrimary: true,
  },
  student: {
    id: "student-1",
    firstName: "John",
    lastName: "Smith",
    gradeLevel: "8th",
    email: "john@example.com",
    tuitionAmount: 500,
    tuitionStatus: "current",
  },
  allParents: [
    {
      name: "Jane Doe",
      email: "jane@example.com",
      phone: "555-1234",
      is_primary: true,
    },
  ],
  classes: [] as { id: string; name: string; hoursPerWeek: number }[],
  schedules: [] as { class_id: string; day: string; time: string }[],
  attendance: [] as {
    class_id: string;
    attendance_date: string;
    status: string;
  }[],
  quizzes: [] as {
    id: string;
    title: string;
    className: string;
    completed: boolean;
    score: number | null;
    maxScore: number;
    submittedAt: string | null;
  }[],
};

describe("ParentDashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the parent name and student information", () => {
    render(<ParentDashboard {...baseProps} />);

    expect(screen.getByText(/welcome, jane doe/i)).toBeInTheDocument();
    expect(screen.getByText("John Smith")).toBeInTheDocument();
    expect(screen.getByText("8th")).toBeInTheDocument();
    expect(screen.getByText("current")).toBeInTheDocument();
  });

  it("shows a message when the student has no classes", () => {
    render(<ParentDashboard {...baseProps} />);

    expect(
      screen.getByText(/not enrolled in any classes yet/i),
    ).toBeInTheDocument();
  });

  it("lists classes with their schedule", () => {
    render(
      <ParentDashboard
        {...baseProps}
        classes={[{ id: "class-1", name: "Algebra II", hoursPerWeek: 3 }]}
        schedules={[{ class_id: "class-1", day: "Mon", time: "10:00" }]}
      />,
    );

    expect(screen.getByText("Algebra II")).toBeInTheDocument();
    expect(screen.getByText(/3 hours per week/i)).toBeInTheDocument();
    expect(screen.getByText(/mon at 10:00/i)).toBeInTheDocument();
  });

  it("shows a message when there are no attendance records", () => {
    render(<ParentDashboard {...baseProps} />);

    expect(screen.getByText(/no attendance records yet/i)).toBeInTheDocument();
  });

  it("computes the attendance rate from present, late, and absent records", () => {
    render(
      <ParentDashboard
        {...baseProps}
        classes={[{ id: "class-1", name: "Algebra II", hoursPerWeek: 3 }]}
        attendance={[
          { class_id: "class-1", attendance_date: "2026-01-05", status: "present" },
          { class_id: "class-1", attendance_date: "2026-01-06", status: "present" },
          { class_id: "class-1", attendance_date: "2026-01-07", status: "late" },
          { class_id: "class-1", attendance_date: "2026-01-08", status: "absent" },
        ]}
      />,
    );

    // 3 of 4 records count toward attendance (present + late), so rate = 75%
    expect(screen.getByText("75%")).toBeInTheDocument();
    expect(screen.getAllByText(/algebra ii/i).length).toBeGreaterThan(0);
  });

  it("shows other parent/guardian contact info when present", () => {
    render(
      <ParentDashboard
        {...baseProps}
        allParents={[
          ...baseProps.allParents,
          {
            name: "John Doe Sr.",
            email: "john.sr@example.com",
            phone: "555-5678",
            is_primary: false,
          },
        ]}
      />,
    );

    expect(screen.getByText("John Doe Sr.")).toBeInTheDocument();
    expect(screen.getByText("john.sr@example.com")).toBeInTheDocument();
  });

  it("signs the parent out and redirects home", async () => {
    const user = userEvent.setup();
    signOut.mockResolvedValue({ error: null });

    render(<ParentDashboard {...baseProps} />);

    await user.click(screen.getByRole("button", { name: /sign out/i }));

    expect(signOut).toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith("/");
  });

  it("shows a message when there are no quizzes assigned", () => {
    render(<ParentDashboard {...baseProps} />);

    expect(screen.getByText(/no quizzes assigned yet/i)).toBeInTheDocument();
  });

  it("lists quizzes with scores and a not-taken-yet state", () => {
    render(
      <ParentDashboard
        {...baseProps}
        quizzes={[
          {
            id: "quiz-1",
            title: "Chapter 3 Quiz",
            className: "Algebra II",
            completed: true,
            score: 4,
            maxScore: 5,
            submittedAt: "2026-01-02T00:00:00Z",
          },
          {
            id: "quiz-2",
            title: "Pop Quiz",
            className: "Biology",
            completed: false,
            score: null,
            maxScore: 3,
            submittedAt: null,
          },
        ]}
      />,
    );

    expect(screen.getByText("Chapter 3 Quiz")).toBeInTheDocument();
    expect(screen.getByText("4 / 5")).toBeInTheDocument();
    expect(screen.getByText("Pop Quiz")).toBeInTheDocument();
    expect(screen.getByText(/not taken yet/i)).toBeInTheDocument();
  });

  it("shows a comma-joined class list for a quiz assigned to more than one of the child's classes", () => {
    render(
      <ParentDashboard
        {...baseProps}
        quizzes={[
          {
            id: "quiz-1",
            title: "Shared Quiz",
            className: "Algebra II, Geometry",
            completed: false,
            score: null,
            maxScore: 5,
            submittedAt: null,
          },
        ]}
      />,
    );

    expect(screen.getByText("Shared Quiz")).toBeInTheDocument();
    expect(screen.getByText("Algebra II, Geometry")).toBeInTheDocument();
  });
});

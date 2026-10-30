/// <reference types="vitest/globals" />

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

import { AssessmentRoster } from "@/components/teacher-app/assessment-roster";
import {
  enterAssessmentMarkAction,
  markAllAssessmentTakenAction,
  markAssessmentTakenAction,
  undoAssessmentTakenAction,
} from "@/app/protected/teacher/assessments-actions";
import type { TeacherAssessmentAssignmentRow } from "@/lib/types/database";

vi.mock("@/app/protected/teacher/assessments-actions", () => ({
  markAssessmentTakenAction: vi.fn(),
  markAllAssessmentTakenAction: vi.fn(),
  undoAssessmentTakenAction: vi.fn(),
  enterAssessmentMarkAction: vi.fn(),
}));

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

function row(id: string, name: string, extra: Partial<TeacherAssessmentAssignmentRow> = {}): TeacherAssessmentAssignmentRow {
  return {
    id,
    assessment_id: "t1",
    student_id: `s-${id}`,
    kind: "mock_exam",
    effective_scheduled_date: "2026-10-30",
    effective_scheduled_time: "17:00",
    effective_deadline_at: null,
    taken_at: null,
    status: "registered",
    score: null,
    teacher_comment: null,
    graded_paper_url: null,
    created_at: "2026-10-01T00:00:00Z",
    studentName: name,
    isLate: false,
    ...extra,
  };
}

// The "Taken 3/5 · Marked 1/5" summary line.
function progress(): string {
  return screen.getByText(/^Taken/, { selector: "p" }).textContent ?? "";
}

function renderRoster(roster: TeacherAssessmentAssignmentRow[]) {
  return render(
    <AssessmentRoster
      assessmentId="t1"
      kind="mock_exam"
      maxScore={20}
      defaultWhen={{ date: "2026-10-30", time: "17:00" }}
      notifyByDefault
      initialRoster={roster}
    />,
  );
}

describe("AssessmentRoster", () => {
  beforeEach(() => {
    vi.mocked(markAssessmentTakenAction).mockReset();
    vi.mocked(markAllAssessmentTakenAction).mockReset();
    vi.mocked(undoAssessmentTakenAction).mockReset();
    vi.mocked(enterAssessmentMarkAction).mockReset();
    refresh.mockReset();
  });

  it("marks one student taken with one tap", async () => {
    vi.mocked(markAssessmentTakenAction).mockResolvedValue(
      row("a1", "Νίκη Αλεξίου", { status: "taken", taken_at: new Date().toISOString() }),
    );
    renderRoster([row("a1", "Νίκη Αλεξίου"), row("a2", "Πέτρος Βλάχος")]);

    await userEvent.click(screen.getByRole("button", { name: "Mark Νίκη Αλεξίου taken" }));
    expect(markAssessmentTakenAction).toHaveBeenCalledWith("a1");
    expect(progress()).toBe("Taken 1/2 · Marked 0/2");
    expect(screen.getByRole("button", { name: "Undo taken for Νίκη Αλεξίου" })).toBeInTheDocument();
    expect(refresh).toHaveBeenCalled();
  });

  it("puts the row back when marking fails", async () => {
    vi.mocked(markAssessmentTakenAction).mockRejectedValue(new Error("offline"));
    renderRoster([row("a1", "Νίκη Αλεξίου")]);

    await userEvent.click(screen.getByRole("button", { name: "Mark Νίκη Αλεξίου taken" }));
    expect(await screen.findByRole("button", { name: "Mark Νίκη Αλεξίου taken" })).toBeInTheDocument();
  });

  it("undoes a taken student", async () => {
    vi.mocked(undoAssessmentTakenAction).mockResolvedValue(row("a1", "Νίκη Αλεξίου"));
    renderRoster([row("a1", "Νίκη Αλεξίου", { status: "taken", taken_at: "2026-10-30T15:00:00Z" })]);

    await userEvent.click(screen.getByRole("button", { name: "Undo taken for Νίκη Αλεξίου" }));
    expect(undoAssessmentTakenAction).toHaveBeenCalledWith("a1");
    expect(screen.getByRole("button", { name: "Mark Νίκη Αλεξίου taken" })).toBeInTheDocument();
  });

  it("asks for a second tap before marking everyone left", async () => {
    vi.mocked(markAllAssessmentTakenAction).mockResolvedValue([
      row("a1", "A", { status: "taken", taken_at: "2026-10-30T15:00:00Z" }),
      row("a2", "B", { status: "taken", taken_at: "2026-10-30T15:00:00Z" }),
    ]);
    renderRoster([row("a1", "A"), row("a2", "B"), row("a3", "C", { status: "marked", taken_at: "2026-10-29T15:00:00Z", score: 15 })]);

    await userEvent.click(screen.getByRole("button", { name: /Mark all remaining taken \(2\)/ }));
    expect(markAllAssessmentTakenAction).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: /Tap again: mark 2 students taken/ }));
    expect(markAllAssessmentTakenAction).toHaveBeenCalledWith("t1");
    expect(progress()).toBe("Taken 3/3 · Marked 1/3");
  });

  it("saves a score, keeping the console's comment and graded paper", async () => {
    const taken = row("a1", "Νίκη Αλεξίου", {
      status: "taken",
      taken_at: "2026-10-30T15:00:00Z",
      teacher_comment: "Good work",
      graded_paper_url: "https://example.com/p",
    });
    vi.mocked(enterAssessmentMarkAction).mockResolvedValue({ ...taken, status: "marked", score: 17.5 });
    renderRoster([taken]);

    await userEvent.click(screen.getByRole("button", { name: "Score" }));
    const input = screen.getByRole("textbox", { name: /Score for Νίκη Αλεξίου/ });
    await userEvent.type(input, "17,5");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(enterAssessmentMarkAction).toHaveBeenCalledWith("a1", {
      score: 17.5,
      teacherComment: "Good work",
      gradedPaperUrl: "https://example.com/p",
      notify: true,
    });
    expect(screen.getByRole("button", { name: /Score 17.5 of 20/ })).toBeInTheDocument();
  });

  it("won't save a score above the maximum", async () => {
    renderRoster([row("a1", "Νίκη", { status: "taken", taken_at: "2026-10-30T15:00:00Z" })]);
    await userEvent.click(screen.getByRole("button", { name: "Score" }));
    await userEvent.type(screen.getByRole("textbox", { name: /Score for Νίκη/ }), "25");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("shows a moved student's own date and the late badge", () => {
    renderRoster([
      row("a1", "Moved", { effective_scheduled_date: "2026-11-02" }),
      row("a2", "Late one", { status: "taken", taken_at: "2026-10-31T10:00:00Z", isLate: true }),
    ]);
    const items = screen.getAllByRole("listitem");
    expect(within(items[0]).getByText(/Own date: Mon 2 Nov 17:00/)).toBeInTheDocument();
    expect(within(items[1]).getByText("Late")).toBeInTheDocument();
  });
});

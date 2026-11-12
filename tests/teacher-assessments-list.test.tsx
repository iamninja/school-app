/// <reference types="vitest/globals" />

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

import { TeacherAssessments } from "@/components/teacher-assessments";
import type { TeacherAssessmentAssignmentRow, TeacherAssessmentListItem } from "@/lib/types/database";

vi.mock("@/app/protected/teacher/assessments-actions", () => ({}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/lib/push/athens-time", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/push/athens-time")>()),
  athensToday: () => "2026-11-12",
}));

function assessment(o: Partial<TeacherAssessmentListItem>): TeacherAssessmentListItem {
  return {
    id: "a", kind: "mock_exam", title: "Test", description: null, max_score: 20, duration_minutes: 90,
    scheduled_date: "2026-11-20", scheduled_time: null, deadline_at: null, class_id: "c1", class_name: "Β Λυκείου",
    grade: null, created_at: "2026-10-01T10:00:00Z", assignmentCount: 0, markedCount: 0, ...o,
  };
}
function row(assessmentId: string, status: TeacherAssessmentAssignmentRow["status"], isLate = false): TeacherAssessmentAssignmentRow {
  return {
    id: `${assessmentId}-${status}`, assessment_id: assessmentId, student_id: "s", kind: "mock_exam",
    effective_scheduled_date: null, effective_scheduled_time: null, effective_deadline_at: null,
    taken_at: status === "registered" ? null : "2026-11-01T10:00:00Z", status, score: status === "marked" ? 15 : null,
    teacher_comment: null, graded_paper_url: null, created_at: "", studentName: "", isLate,
  };
}

const ASSESSMENTS = [
  assessment({ id: "late", title: "Διαγώνισμα Άλγεβρας", scheduled_date: "2026-11-05" }),
  assessment({ id: "soon", title: "Γεωμετρία", scheduled_date: "2026-11-25", class_id: "c2", class_name: "Γ Γυμνασίου" }),
  assessment({ id: "done", title: "Τριγωνομετρία", scheduled_date: "2026-10-20" }),
  assessment({ id: "old", title: "Πολυώνυμα", scheduled_date: "2026-05-10" }),
];
const ROWS = [row("late", "registered", true), row("soon", "registered"), row("done", "marked"), row("old", "marked")];

function renderTab() {
  return render(
    <TeacherAssessments
      classes={[]}
      students={[]}
      assessments={ASSESSMENTS}
      assessmentAssignments={ROWS}
      onAssessmentsChange={vi.fn()}
      onAssessmentAssignmentsChange={vi.fn()}
      selectedAssessmentId={null}
      onSelectedAssessmentIdChange={vi.fn()}
    />,
  );
}

describe("Assessments list", () => {
  it("groups by what needs doing, with Done folded and earlier years hidden", async () => {
    renderTab();
    expect(within(screen.getByRole("region", { name: "Needs attention" })).getByText("Διαγώνισμα Άλγεβρας")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Upcoming" })).getByText("Γεωμετρία")).toBeInTheDocument();
    expect(screen.getByText("1 not taken yet")).toBeInTheDocument();
    expect(screen.queryByText("Τριγωνομετρία")).not.toBeInTheDocument();
    expect(screen.getByText(/1 from earlier school years \(hidden\)/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Done/ }));
    expect(screen.getByText("Τριγωνομετρία")).toBeInTheDocument();
    expect(screen.queryByText("Πολυώνυμα")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("checkbox"));
    expect(screen.getByText("Πολυώνυμα")).toBeInTheDocument();
  });

  it("filters by class and by an accent-insensitive title search", async () => {
    renderTab();
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Filter by class" }), "c2");
    expect(screen.getByText("Γεωμετρία")).toBeInTheDocument();
    expect(screen.queryByText("Διαγώνισμα Άλγεβρας")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    await userEvent.type(screen.getByRole("searchbox", { name: "Search assessments by title" }), "αλγεβρας");
    expect(screen.getByText("Διαγώνισμα Άλγεβρας")).toBeInTheDocument();
    expect(screen.queryByText("Γεωμετρία")).not.toBeInTheDocument();
  });
});

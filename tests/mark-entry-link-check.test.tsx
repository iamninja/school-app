import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MarkEntryForm } from "@/components/teacher-assessments";
import * as assessmentActions from "@/app/protected/teacher/assessments-actions";
import type { TeacherAssessmentAssignmentRow } from "@/lib/types/database";

vi.mock("@/app/protected/teacher/assessments-actions", () => ({
  checkGradedPaperLinkAction: vi.fn(),
  enterAssessmentMarkAction: vi.fn(),
  // The rest of the module's exports are only referenced by other components
  // in the same file; any of them being undefined at import time is fine.
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const assignment: TeacherAssessmentAssignmentRow = {
  id: "assignment-1",
  assessment_id: "assessment-1",
  student_id: "student-1",
  kind: "short_assessment",
  effective_scheduled_date: null,
  effective_scheduled_time: null,
  effective_deadline_at: null,
  taken_at: null,
  status: "registered",
  score: null,
  teacher_comment: null,
  graded_paper_url: null,
  created_at: "2026-10-01T00:00:00Z",
  studentName: "Maya Carter",
  isLate: false,
};

function renderForm(overrides: Partial<TeacherAssessmentAssignmentRow> = {}) {
  return render(
    <MarkEntryForm
      assignment={{ ...assignment, ...overrides }}
      maxScore={100}
      onSaved={vi.fn()}
    />,
  );
}

function typeUrl(value: string) {
  fireEvent.change(screen.getByLabelText(/graded paper/i), {
    target: { value },
  });
}

describe("MarkEntryForm - graded paper link check", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(assessmentActions.checkGradedPaperLinkAction).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows no indicator while the field is empty and never calls the check", async () => {
    renderForm();

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.queryByLabelText("Checking link…")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Link looks shareable")).not.toBeInTheDocument();
    expect(assessmentActions.checkGradedPaperLinkAction).not.toHaveBeenCalled();
  });

  it("shows 'checking' immediately, waits out the 500ms debounce, then shows a good link", async () => {
    vi.mocked(assessmentActions.checkGradedPaperLinkAction).mockResolvedValue({
      ok: true,
    });
    renderForm();

    typeUrl("https://drive.google.com/file/d/abc/view");

    // Right away: spinner, and no call yet.
    expect(screen.getByLabelText("Checking link…")).toBeInTheDocument();
    expect(assessmentActions.checkGradedPaperLinkAction).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(499);
    });
    expect(assessmentActions.checkGradedPaperLinkAction).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(assessmentActions.checkGradedPaperLinkAction).toHaveBeenCalledWith(
      "https://drive.google.com/file/d/abc/view",
    );
    expect(screen.getByLabelText("Link looks shareable")).toBeInTheDocument();
    expect(screen.queryByLabelText("Checking link…")).not.toBeInTheDocument();
  });

  it("shows the reason when the link is not shareable", async () => {
    vi.mocked(assessmentActions.checkGradedPaperLinkAction).mockResolvedValue({
      ok: false,
      reason: "The link needs sharing turned on",
    });
    renderForm();

    typeUrl("https://example.com/private.pdf");
    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    expect(
      screen.getByLabelText("The link needs sharing turned on"),
    ).toBeInTheDocument();
  });

  it("only checks the last URL when typing continues inside the debounce window", async () => {
    vi.mocked(assessmentActions.checkGradedPaperLinkAction).mockResolvedValue({
      ok: true,
    });
    renderForm();

    typeUrl("https://example.com/a");
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    typeUrl("https://example.com/ab");
    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    expect(assessmentActions.checkGradedPaperLinkAction).toHaveBeenCalledTimes(1);
    expect(assessmentActions.checkGradedPaperLinkAction).toHaveBeenCalledWith(
      "https://example.com/ab",
    );
  });

  it("goes back to 'checking' for a new URL instead of showing the previous result", async () => {
    vi.mocked(assessmentActions.checkGradedPaperLinkAction).mockResolvedValue({
      ok: true,
    });
    renderForm();

    typeUrl("https://example.com/first");
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.getByLabelText("Link looks shareable")).toBeInTheDocument();

    typeUrl("https://example.com/second");

    expect(screen.queryByLabelText("Link looks shareable")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Checking link…")).toBeInTheDocument();
  });

  it("clears the indicator when the field is emptied", async () => {
    vi.mocked(assessmentActions.checkGradedPaperLinkAction).mockResolvedValue({
      ok: true,
    });
    renderForm();

    typeUrl("https://example.com/first");
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.getByLabelText("Link looks shareable")).toBeInTheDocument();

    typeUrl("");

    expect(screen.queryByLabelText("Link looks shareable")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Checking link…")).not.toBeInTheDocument();
  });

  it("ignores a result that arrives after the field changed (no stale indicator)", async () => {
    let resolveFirst: (value: { ok: true }) => void = () => {};
    vi.mocked(assessmentActions.checkGradedPaperLinkAction)
      .mockImplementationOnce(
        () => new Promise((resolve) => { resolveFirst = resolve as typeof resolveFirst; }),
      )
      .mockResolvedValue({ ok: false, reason: "second one is bad" });
    renderForm();

    typeUrl("https://example.com/first");
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    // First check is in flight; the user edits before it returns.
    typeUrl("https://example.com/second");
    await act(async () => {
      resolveFirst({ ok: true });
    });

    expect(screen.queryByLabelText("Link looks shareable")).not.toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.getByLabelText("second one is bad")).toBeInTheDocument();
  });

  it("starts in 'checking' for a mark that already has a saved link, then settles", async () => {
    vi.mocked(assessmentActions.checkGradedPaperLinkAction).mockResolvedValue({
      ok: true,
    });
    renderForm({ graded_paper_url: "https://example.com/saved.pdf" });

    expect(screen.getByLabelText("Checking link…")).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.getByLabelText("Link looks shareable")).toBeInTheDocument();
  });
});

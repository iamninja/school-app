import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { checkPracticeImportAction, deletePracticeSectionsAction, importPracticeMarkdownAction } from "@/app/protected/teacher/practice-actions";
import { ImportDialog, TeacherPractice, withSectionHeading } from "@/components/teacher-practice";
import type { PracticeSection } from "@/lib/practice-bank";

vi.mock("@/app/protected/teacher/practice-actions", () => ({
  checkPracticeImportAction: vi.fn(),
  copyQuizQuestionsToPracticeAction: vi.fn(),
  correctPracticeAiCheckAction: vi.fn(),
  createPracticeSectionAction: vi.fn(),
  deletePracticeQuestionAction: vi.fn(),
  deletePracticeQuestionsAction: vi.fn(),
  deletePracticeSectionAction: vi.fn(),
  deletePracticeSectionsAction: vi.fn(),
  getPracticeQuestionStatsAction: vi.fn().mockResolvedValue({}),
  importPracticeMarkdownAction: vi.fn(),
  listCopyableQuizzesAction: vi.fn(),
  listPracticeAiChecksAction: vi.fn().mockResolvedValue([]),
  listPracticeQuestionsAction: vi.fn().mockResolvedValue([]),
  listPracticeReportsAction: vi.fn(),
  listPracticeSectionsAction: vi.fn(),
  movePracticeQuestionsAction: vi.fn(),
  removePracticeDuplicatesAction: vi.fn(),
  reorderPracticeSectionsAction: vi.fn(),
  resolvePracticeReportAction: vi.fn(),
  savePracticeQuestionAction: vi.fn(),
  setPracticeQuestionActiveAction: vi.fn(),
  updatePracticeSectionAction: vi.fn(),
}));
vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const SECTIONS: PracticeSection[] = [
  { id: "s1", grade: "gym_a", name: "Α1.1 Φυσικοί αριθμοί", position: 0, isPublic: true, questionCount: 32 },
  { id: "s2", grade: "gym_a", name: "Α1.2 Πράξεις", position: 1, isPublic: true, questionCount: 30 },
  { id: "s3", grade: "gym_a", name: "Α2.1 Κλάσματα", position: 2, isPublic: false, questionCount: 23 },
  { id: "s9", grade: "lyk_c", name: "Παράγωγοι", position: 0, isPublic: true, questionCount: 5 },
];

beforeEach(() => vi.clearAllMocks());

describe("a file without a section heading", () => {
  it("is named after the file; a file with one keeps it", () => {
    expect(withSectionHeading("## Πόσο κάνει $2+2$;\nAnswer: 4\n", "Α2.4 Πρόσθεση κλασμάτων.md")).toBe(
      "# Α2.4 Πρόσθεση κλασμάτων\n\n## Πόσο κάνει $2+2$;\nAnswer: 4\n",
    );
    expect(withSectionHeading("# Δική του\n\n## Ερώτηση\nAnswer: 1\n", "x.md")).toBe("# Δική του\n\n## Ερώτηση\nAnswer: 1\n");
    // A heading only inside a comment doesn't count.
    expect(withSectionHeading("<!--\n# not this\n-->\n## Ερώτηση\nAnswer: 1\n", "κεφ_3.md").startsWith("# κεφ 3\n")).toBe(true);
  });
});

describe("deleting several sections (remaking a grade)", () => {
  it("ticks sections, shows what goes, and deletes only after typing delete", async () => {
    vi.mocked(deletePracticeSectionsAction).mockResolvedValue({ deleted: 3, questions: 85 });
    render(<TeacherPractice initialSections={SECTIONS} initialProgress={[]} initialReports={[]} />);
    await userEvent.selectOptions(screen.getByLabelText("Grade"), "gym_a");
    await userEvent.click(screen.getByRole("button", { name: "Select sections" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Select all sections" }));
    await userEvent.click(screen.getByRole("button", { name: /Delete 3/ }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Delete all 3 sections of Α Γυμνασίου?")).toBeInTheDocument();
    expect(within(dialog).getByText(/3 sections and their 85 active questions/)).toBeInTheDocument();
    const confirm = within(dialog).getByRole("button", { name: "Delete 3 sections" });
    expect(confirm).toBeDisabled();
    await userEvent.type(within(dialog).getByLabelText(/Type delete to confirm/), "delete");
    await userEvent.click(confirm);

    expect(deletePracticeSectionsAction).toHaveBeenCalledWith(["s1", "s2", "s3"]);
    await waitFor(() => expect(screen.queryByText("Α1.1 Φυσικοί αριθμοί")).not.toBeInTheDocument());
    expect(screen.getByText(/No sections for this grade yet/)).toBeInTheDocument();
  });

  it("deletes only the ticked ones, never another grade's", async () => {
    vi.mocked(deletePracticeSectionsAction).mockResolvedValue({ deleted: 1, questions: 23 });
    render(<TeacherPractice initialSections={SECTIONS} initialProgress={[]} initialReports={[]} />);
    await userEvent.selectOptions(screen.getByLabelText("Grade"), "gym_a");
    await userEvent.click(screen.getByRole("button", { name: "Select sections" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Select Α2.1 Κλάσματα" }));
    await userEvent.click(screen.getByRole("button", { name: /Delete 1/ }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText(/Type delete to confirm/), "DELETE");
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete 1 section" }));
    expect(deletePracticeSectionsAction).toHaveBeenCalledWith(["s3"]);
    const list = screen.getByRole("list", { name: "Sections" });
    await waitFor(() => expect(within(list).queryByText("Α2.1 Κλάσματα")).not.toBeInTheDocument());
    expect(within(list).getByText("Α1.1 Φυσικοί αριθμοί")).toBeInTheDocument();
    expect(within(list).getByText("Α1.2 Πράξεις")).toBeInTheDocument();
  });
});

describe("importing several files at once", () => {
  it("reads them in name order, names headingless ones after the file, and imports them together", async () => {
    vi.mocked(checkPracticeImportAction).mockResolvedValue({
      ok: true,
      sections: [
        { name: "Α1.1 Φυσικοί αριθμοί", exists: false, fresh: 1, skipped: 0 },
        { name: "Α1.2 Πράξεις", exists: false, fresh: 1, skipped: 0 },
      ],
    });
    vi.mocked(importPracticeMarkdownAction).mockResolvedValue({
      ok: true, sectionId: "n1", imported: 2, skipped: 0, createdSection: true,
      sections: [{ id: "n1", name: "Α1.1 Φυσικοί αριθμοί", imported: 1, created: true, skipped: 0 }, { id: "n2", name: "Α1.2 Πράξεις", imported: 1, created: true, skipped: 0 }],
    });
    const onImported = vi.fn();
    render(<ImportDialog open grade="gym_a" sections={[]} currentSectionId={null} onClose={vi.fn()} onImported={onImported} />);
    const second = new File(["## Πόσο κάνει $3 \\cdot 4$;\nAnswer: 12\n"], "Α1.2 Πράξεις.md", { type: "text/markdown" });
    const first = new File(["# Α1.1 Φυσικοί αριθμοί\n\n## Ο μεγαλύτερος: $12$ ή $21$;\n- [x] $21$\n- [ ] $12$\n"], "Α1.1.md", { type: "text/markdown" });
    await userEvent.upload(screen.getByLabelText(/Choose .md files/), [second, first]);

    expect(await screen.findByText("2 files, in this order: Α1.1.md · Α1.2 Πράξεις.md")).toBeInTheDocument();
    const markdown = (screen.getByPlaceholderText(/Η ευθεία/) as HTMLTextAreaElement).value;
    expect(markdown.indexOf("# Α1.1 Φυσικοί αριθμοί")).toBeLessThan(markdown.indexOf("# Α1.2 Πράξεις"));
    await userEvent.click(await screen.findByRole("button", { name: "Import 2" }));
    expect(vi.mocked(importPracticeMarkdownAction).mock.calls[0][0]).toMatchObject({ grade: "gym_a", sectionId: null });
    expect(onImported).toHaveBeenCalled();
  });
});

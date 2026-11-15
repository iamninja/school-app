import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  copyQuizQuestionsToPracticeAction,
  importPracticeMarkdownAction,
  listCopyableQuizzesAction,
  savePracticeQuestionAction,
} from "@/app/protected/teacher/practice-actions";
import { PracticeQuestionEditor } from "@/components/practice/practice-question-editor";
import { CopyFromQuizzesDialog, ImportDialog } from "@/components/teacher-practice";
import type { PracticeSection } from "@/lib/practice-bank";
import { PRACTICE_MARKDOWN_TEMPLATE } from "@/lib/practice-markdown-template";

vi.mock("@/app/protected/teacher/practice-actions", () => ({
  copyQuizQuestionsToPracticeAction: vi.fn(),
  createPracticeSectionAction: vi.fn(),
  deletePracticeQuestionAction: vi.fn(),
  deletePracticeSectionAction: vi.fn(),
  getPracticeQuestionStatsAction: vi.fn(),
  importPracticeMarkdownAction: vi.fn(),
  listCopyableQuizzesAction: vi.fn(),
  listPracticeQuestionsAction: vi.fn(),
  listPracticeReportsAction: vi.fn(),
  listPracticeSectionsAction: vi.fn(),
  reorderPracticeSectionsAction: vi.fn(),
  resolvePracticeReportAction: vi.fn(),
  savePracticeQuestionAction: vi.fn(),
  setPracticeQuestionActiveAction: vi.fn(),
  updatePracticeSectionAction: vi.fn(),
}));
vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const SECTIONS: PracticeSection[] = [
  { id: "s-line", grade: "lyk_b", name: "Η ευθεία", position: 0, isPublic: true, questionCount: 3 },
  { id: "s-poly", grade: "lyk_b", name: "Πολυώνυμα", position: 1, isPublic: false, questionCount: 0 },
];

beforeEach(() => vi.clearAllMocks());

describe("importing a Markdown file", () => {
  const renderImport = (onImported = vi.fn()) => {
    render(
      <ImportDialog open grade="lyk_b" sections={SECTIONS} currentSectionId="s-poly" onClose={vi.fn()} onImported={onImported} />,
    );
    return onImported;
  };
  const paste = (markdown: string) =>
    fireEvent.change(screen.getByPlaceholderText(/Η ευθεία/), { target: { value: markdown } });

  it("previews a correct file and imports it into the section it names", async () => {
    vi.mocked(importPracticeMarkdownAction).mockResolvedValue({ ok: true, sectionId: "s-line", imported: 7, createdSection: false });
    const onImported = renderImport();
    paste(PRACTICE_MARKDOWN_TEMPLATE);

    expect(screen.getByText('7 questions ready for "Η ευθεία"')).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Import 7" }));

    expect(importPracticeMarkdownAction).toHaveBeenCalledWith({ grade: "lyk_b", markdown: PRACTICE_MARKDOWN_TEMPLATE, sectionId: null });
    await waitFor(() => expect(onImported).toHaveBeenCalledWith("s-line"));
  });

  it("imports into a section picked instead of the file's", async () => {
    vi.mocked(importPracticeMarkdownAction).mockResolvedValue({ ok: true, sectionId: "s-poly", imported: 7, createdSection: false });
    renderImport();
    paste(PRACTICE_MARKDOWN_TEMPLATE);
    await userEvent.selectOptions(screen.getByLabelText("Into"), "s-poly");

    expect(screen.getByText('7 questions ready for "Πολυώνυμα"')).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Import 7" }));
    expect(vi.mocked(importPracticeMarkdownAction).mock.calls[0][0].sectionId).toBe("s-poly");
  });

  it("shows what's wrong and saves nothing when a question has no correct option", async () => {
    renderImport();
    paste("# Τεστ\n\n## Ποιο είναι σωστό;\n- [ ] Το ένα\n- [ ] Το άλλο\n");

    expect(await screen.findByRole("listitem")).toBeInTheDocument();
    expect(screen.queryByText(/ready/)).not.toBeInTheDocument();
    const importButton = screen.getByRole("button", { name: /^Import/ });
    expect(importButton).toBeDisabled();
    await userEvent.click(importButton);
    expect(importPracticeMarkdownAction).not.toHaveBeenCalled();
  });

  it("asks for a section when the file names none", () => {
    renderImport();
    paste("## $2 + 2$ = ;\nAnswer: 4\n");
    expect(screen.getByText("1 question ready - pick a section above")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Import 1" })).toBeDisabled();
  });

  it("shows the server's objections and stays open", async () => {
    vi.mocked(importPracticeMarkdownAction).mockResolvedValue({ ok: false, errors: ["Question 3: the answer isn't a number"] });
    const onImported = renderImport();
    paste(PRACTICE_MARKDOWN_TEMPLATE);
    await userEvent.click(screen.getByRole("button", { name: "Import 7" }));

    expect(await screen.findByText("Question 3: the answer isn't a number")).toBeInTheDocument();
    expect(onImported).not.toHaveBeenCalled();
  });
});

describe("copying quiz questions", () => {
  beforeEach(() => {
    vi.mocked(listCopyableQuizzesAction).mockResolvedValue([
      {
        id: "quiz-1",
        title: "Διαγώνισμα ευθείας",
        questions: [
          { id: "qq-choice", prompt: "Κλίση της $y = 2x$;", becomes: "choice", alreadyCopied: false },
          { id: "qq-number", prompt: "Πόσο κάνει $3 \\cdot 4$;", becomes: "number", alreadyCopied: false },
          { id: "qq-copied", prompt: "Σωστό ή λάθος;", becomes: "true_false", alreadyCopied: true },
          { id: "qq-written", prompt: "Εξήγησε γιατί.", becomes: null, alreadyCopied: false },
        ],
      },
    ]);
    vi.mocked(copyQuizQuestionsToPracticeAction).mockResolvedValue({ copied: 2, skipped: 0 });
  });

  it("'all of a quiz' picks what can be copied and isn't already, never written answers", async () => {
    const onCopied = vi.fn();
    render(<CopyFromQuizzesDialog open sectionId="s-line" sectionName="Η ευθεία" onClose={vi.fn()} onCopied={onCopied} />);

    expect(await screen.findByText("3 of 4 can be copied")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("checkbox", { name: "All of Διαγώνισμα ευθείας" }));
    await userEvent.click(screen.getByRole("button", { name: "Copy 2" }));

    expect(copyQuizQuestionsToPracticeAction).toHaveBeenCalledWith({ sectionId: "s-line", quizQuestionIds: ["qq-choice", "qq-number"] });
    await waitFor(() => expect(onCopied).toHaveBeenCalledWith(2));
  });

  it("won't let a written answer be picked", async () => {
    render(<CopyFromQuizzesDialog open sectionId="s-line" sectionName="Η ευθεία" onClose={vi.fn()} onCopied={vi.fn()} />);
    await userEvent.click(await screen.findByRole("button", { name: /Διαγώνισμα ευθείας/ }));

    const written = screen.getByText("Written answer - stays behind").closest("label")!;
    expect(within(written).getByRole("checkbox")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Copy" })).toBeDisabled();
  });
});

describe("the question editor", () => {
  const renderEditor = () =>
    render(
      <PracticeQuestionEditor open sectionId="s-line" sectionName="Η ευθεία" question={null} onClose={vi.fn()} onSaved={vi.fn()} />,
    );

  it("won't save a multiple-choice question until it has a prompt and two options", async () => {
    vi.mocked(savePracticeQuestionAction).mockResolvedValue({ id: "new" } as never);
    renderEditor();
    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toBeDisabled();

    await userEvent.type(screen.getByLabelText("Question"), "Ποια είναι η κλίση;");
    expect(save).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("Correct answer"), { target: { value: "3" } });
    fireEvent.change(screen.getAllByPlaceholderText("A typical mistake")[0], { target: { value: "-2" } });
    expect(save).toBeEnabled();

    await userEvent.click(save);
    const sent = vi.mocked(savePracticeQuestionAction).mock.calls[0][0];
    // The empty third option is left out.
    expect(sent.spec.options).toEqual([{ text: "3", correct: true }, { text: "-2", correct: false }]);
    expect(sent).toMatchObject({ sectionId: "s-line", questionId: null });
  });

  it("refuses a tolerance that isn't a number", async () => {
    renderEditor();
    await userEvent.click(screen.getByRole("radio", { name: "Number" }));
    await userEvent.type(screen.getByLabelText("Question"), "Πόσο κάνει $2 + 2$;");
    fireEvent.change(screen.getByLabelText("Answer"), { target: { value: "4" } });
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();

    fireEvent.change(screen.getByLabelText(/Counts as right within/), { target: { value: "about one" } });
    expect(screen.getByText("Tolerance, range and step take plain numbers")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });
});

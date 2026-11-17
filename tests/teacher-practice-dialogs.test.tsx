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
  checkPracticeImportAction: vi.fn(),
  deletePracticeQuestionsAction: vi.fn(),
  removePracticeDuplicatesAction: vi.fn(),
  movePracticeQuestionsAction: vi.fn(),
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
    vi.mocked(importPracticeMarkdownAction).mockResolvedValue({ ok: true, sectionId: "s-line", imported: 7, skipped: 0, createdSection: false, sections: [{ id: "s-line", name: "Η ευθεία", imported: 7, created: false, skipped: 0 }] });
    const onImported = renderImport();
    paste(PRACTICE_MARKDOWN_TEMPLATE);

    expect(screen.getByText('15 questions ready for "Η ευθεία"')).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Import 15" }));

    expect(importPracticeMarkdownAction).toHaveBeenCalledWith({ grade: "lyk_b", markdown: PRACTICE_MARKDOWN_TEMPLATE, sectionId: null });
    await waitFor(() => expect(onImported).toHaveBeenCalledWith("s-line"));
  });

  it("imports into a section picked instead of the file's", async () => {
    vi.mocked(importPracticeMarkdownAction).mockResolvedValue({ ok: true, sectionId: "s-poly", imported: 7, skipped: 0, createdSection: false, sections: [{ id: "s-poly", name: null, imported: 7, created: false, skipped: 0 }] });
    renderImport();
    paste(PRACTICE_MARKDOWN_TEMPLATE);
    await userEvent.selectOptions(screen.getByLabelText("Into"), "s-poly");

    expect(screen.getByText('15 questions ready for "Πολυώνυμα"')).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Import 15" }));
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
    await userEvent.click(screen.getByRole("button", { name: "Import 15" }));

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

  it("saves where a question comes from, and needs a name for another source", async () => {
    vi.mocked(savePracticeQuestionAction).mockResolvedValue({ id: "new" } as never);
    renderEditor();
    await userEvent.click(screen.getByRole("radio", { name: "Number" }));
    await userEvent.type(screen.getByLabelText("Question"), "Πόσο κάνει $2 + 2$;");
    fireEvent.change(screen.getByLabelText("Answer"), { target: { value: "4" } });

    await userEvent.selectOptions(screen.getByRole("combobox", { name: /^Source/ }), "custom");
    expect(screen.getByText("Name the source")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    await userEvent.selectOptions(screen.getByRole("combobox", { name: /^Source/ }), "panhellenic");
    fireEvent.change(screen.getByLabelText("Source detail"), { target: { value: "2019 · Θέμα Β" } });
    // The preview shows the label students will see.
    expect(screen.getByText("Πανελλαδικές · 2019 · Θέμα Β")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(vi.mocked(savePracticeQuestionAction).mock.calls[0][0].spec).toMatchObject({ origin: "panhellenic", originDetail: "2019 · Θέμα Β" });
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

describe("moving questions to another section", () => {
  const QUESTION = {
    sectionId: "s-line", type: "number" as const, prompt: "$2 + 2$", options: null, answer: "4", tolerance: null, sliderMin: null, sliderMax: null,
    sliderStep: null, graph: null, variables: null, condition: null, explanation: null, origin: null, originDetail: null, imagePath: null,
    source: "manual" as const, sourceQuizQuestionId: null, isActive: true, createdAt: "2026-11-16T10:00:00Z",
  };

  it("moves the ticked questions and updates both sections' counts", async () => {
    const { TeacherPractice } = await import("@/components/teacher-practice");
    const { listPracticeQuestionsAction, getPracticeQuestionStatsAction, movePracticeQuestionsAction } = await import("@/app/protected/teacher/practice-actions");
    vi.mocked(getPracticeQuestionStatsAction).mockResolvedValue({});
    vi.mocked(listPracticeQuestionsAction).mockResolvedValue([
      { ...QUESTION, id: "q1", position: 0, prompt: "Πρώτη" },
      { ...QUESTION, id: "q2", position: 1, prompt: "Δεύτερη" },
      { ...QUESTION, id: "q3", position: 2, prompt: "Τρίτη" },
    ]);
    vi.mocked(movePracticeQuestionsAction).mockResolvedValue(undefined);
    render(<TeacherPractice initialSections={[{ ...SECTIONS[0], questionCount: 3 }, SECTIONS[1]]} initialProgress={[]} initialReports={[]} />);

    expect(await screen.findByText("Πρώτη")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("checkbox", { name: "Select question 1" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Select question 3" }));
    expect(screen.getByText("2 selected")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Move to/ }));

    const dialog = await screen.findByRole("dialog");
    // The other section of the same grade is offered; the current one isn't.
    expect(within(dialog).getByRole("combobox", { name: "Section" })).toHaveValue("s-poly");
    expect(within(dialog).queryByRole("option", { name: "Η ευθεία" })).not.toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Move" }));

    expect(movePracticeQuestionsAction).toHaveBeenCalledWith(["q1", "q3"], "s-poly");
    await waitFor(() => expect(screen.queryByText("Πρώτη")).not.toBeInTheDocument());
    expect(screen.getByText("Δεύτερη")).toBeInTheDocument();
    expect(screen.queryByText("Τρίτη")).not.toBeInTheDocument();
    // 3 -> 1 active questions here.
    expect(screen.getByText(/1 active question$/)).toBeInTheDocument();
  });

  it("offers sections of another grade, and says when there are none", async () => {
    const { MoveQuestionsDialog } = await import("@/components/teacher-practice");
    const onMove = vi.fn().mockResolvedValue(undefined);
    const other = { id: "s-gym", grade: "gym_c", name: "Εξισώσεις", position: 0, isPublic: false, questionCount: 2 };
    render(<MoveQuestionsDialog open count={1} sections={[...SECTIONS, other]} from={SECTIONS[0]} onClose={vi.fn()} onMove={onMove} />);

    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Grade" }), "lyk_a");
    expect(screen.getByText(/No other section in this grade yet/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Move" })).toBeDisabled();

    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Grade" }), "gym_c");
    await userEvent.click(screen.getByRole("button", { name: "Move" }));
    expect(onMove).toHaveBeenCalledWith("s-gym");
  });
});

describe("importing a file with several sections", () => {
  it("previews where each section's questions go and imports them all", async () => {
    vi.mocked(importPracticeMarkdownAction).mockResolvedValue({
      ok: true, sectionId: "s-line", imported: 3, skipped: 0, createdSection: true,
      sections: [{ id: "s-line", name: "Η ευθεία", imported: 1, skipped: 0, created: false }, { id: "s-new", name: "Κύκλος", imported: 2, skipped: 0, created: true }],
    });
    const onImported = vi.fn();
    render(<ImportDialog open grade="lyk_b" sections={SECTIONS} currentSectionId="s-line" onClose={vi.fn()} onImported={onImported} />);
    fireEvent.change(screen.getByPlaceholderText(/Η ευθεία/), {
      target: { value: "# Η ευθεία\n## $1+1$;\nAnswer: 2\n# Κύκλος\n## $2+2$;\nAnswer: 4\n## $3+3$;\nAnswer: 6\n" },
    });

    expect(screen.getByText("3 questions ready for 2 sections")).toBeInTheDocument();
    expect(screen.getByText("1 question · adds to it")).toBeInTheDocument();
    expect(screen.getByText("2 questions · new section")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Import 3" }));
    expect(vi.mocked(importPracticeMarkdownAction).mock.calls[0][0].sectionId).toBeNull();
    await waitFor(() => expect(onImported).toHaveBeenCalledWith("s-line"));
  });

  it("won't import while some questions sit above every heading", () => {
    render(<ImportDialog open grade="lyk_b" sections={SECTIONS} currentSectionId="s-line" onClose={vi.fn()} onImported={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(/Η ευθεία/), { target: { value: "## $1+1$;\nAnswer: 2\n# Κύκλος\n## $2+2$;\nAnswer: 4\n" } });
    expect(screen.getByText(/Question 1 comes before any/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Import 2" })).toBeDisabled();
  });
});

describe("duplicates", () => {
  const QUESTION = {
    sectionId: "s-line", type: "number" as const, prompt: "$2 + 2$", options: null, answer: "4", tolerance: null, sliderMin: null, sliderMax: null,
    sliderStep: null, graph: null, variables: null, condition: null, explanation: null, origin: null, originDetail: null, imagePath: null,
    source: "import" as const, sourceQuizQuestionId: null, isActive: true, createdAt: "2026-11-16T10:00:00Z",
  };

  it("the import preview says which questions are already there, and imports only the new ones", async () => {
    const { checkPracticeImportAction } = await import("@/app/protected/teacher/practice-actions");
    vi.mocked(checkPracticeImportAction).mockResolvedValue({ ok: true, sections: [{ name: "Η ευθεία", exists: true, fresh: 2, skipped: 5 }] });
    vi.mocked(importPracticeMarkdownAction).mockResolvedValue({
      ok: true, sectionId: "s-line", imported: 2, skipped: 5, createdSection: false,
      sections: [{ id: "s-line", name: "Η ευθεία", imported: 2, skipped: 5, created: false }],
    });
    render(<ImportDialog open grade="lyk_b" sections={SECTIONS} currentSectionId="s-line" onClose={vi.fn()} onImported={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(/Η ευθεία/), { target: { value: PRACTICE_MARKDOWN_TEMPLATE } });

    expect(await screen.findByText("5 of them are already in this grade and will be skipped - 2 new.")).toBeInTheDocument();
    expect(checkPracticeImportAction).toHaveBeenCalledWith({ grade: "lyk_b", markdown: PRACTICE_MARKDOWN_TEMPLATE, sectionId: null });
    await userEvent.click(screen.getByRole("button", { name: "Import 2" }));
    expect(importPracticeMarkdownAction).toHaveBeenCalled();
  });

  it("won't import a file that has nothing new", async () => {
    const { checkPracticeImportAction } = await import("@/app/protected/teacher/practice-actions");
    vi.mocked(checkPracticeImportAction).mockResolvedValue({ ok: true, sections: [{ name: "Η ευθεία", exists: true, fresh: 0, skipped: 7 }] });
    render(<ImportDialog open grade="lyk_b" sections={SECTIONS} currentSectionId="s-line" onClose={vi.fn()} onImported={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(/Η ευθεία/), { target: { value: PRACTICE_MARKDOWN_TEMPLATE } });
    expect(await screen.findByText("Nothing new: all 7 questions are already in this grade.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Import 0" })).toBeDisabled();
  });

  it("deletes the ticked questions after asking, and offers to remove a section's duplicates", async () => {
    const { TeacherPractice } = await import("@/components/teacher-practice");
    const actions = await import("@/app/protected/teacher/practice-actions");
    vi.mocked(actions.getPracticeQuestionStatsAction).mockResolvedValue({});
    vi.mocked(actions.listPracticeQuestionsAction).mockResolvedValue([
      { ...QUESTION, id: "q1", position: 0, prompt: "Πρώτη" },
      { ...QUESTION, id: "q2", position: 1, prompt: "Δεύτερη" },
      { ...QUESTION, id: "q3", position: 2, prompt: "Πρώτη" }, // a copy of q1
      { ...QUESTION, id: "q4", position: 3, prompt: "Τρίτη" },
    ]);
    vi.mocked(actions.deletePracticeQuestionsAction).mockResolvedValue({ deleted: 1 });
    vi.mocked(actions.removePracticeDuplicatesAction).mockResolvedValue({ removed: 1 });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<TeacherPractice initialSections={[{ ...SECTIONS[0], questionCount: 4 }, SECTIONS[1]]} initialProgress={[]} initialReports={[]} />);

    await userEvent.click(await screen.findByRole("button", { name: "Remove 1 duplicate" }));
    expect(confirm).toHaveBeenCalledWith("Remove 1 duplicate question? The first copy of each stays.");
    expect(actions.removePracticeDuplicatesAction).toHaveBeenCalledWith("s-line");
    await waitFor(() => expect(screen.getAllByText("Πρώτη")).toHaveLength(1));
    expect(screen.queryByRole("button", { name: /duplicate/ })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("checkbox", { name: "Select question 3" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete selected" }));
    expect(confirm).toHaveBeenLastCalledWith("Delete 1 question? This can't be undone.");
    expect(actions.deletePracticeQuestionsAction).toHaveBeenCalledWith(["q4"]);
    await waitFor(() => expect(screen.queryByText("Τρίτη")).not.toBeInTheDocument());
    expect(screen.getByText(/2 active questions$/)).toBeInTheDocument();
    confirm.mockRestore();
  });
});

describe("a counterexample question's wrong answers in the list (counterexample v2)", () => {
  it("shows what went wrong, most common first", async () => {
    const { TeacherPractice } = await import("@/components/teacher-practice");
    const { listPracticeQuestionsAction, getPracticeQuestionStatsAction } = await import("@/app/protected/teacher/practice-actions");
    vi.mocked(getPracticeQuestionStatsAction).mockResolvedValue({
      q1: { answers: 9, right: 3, reports: 0, mistakes: { claim: 1, h: 4, c: 1, other: 0 } },
    });
    vi.mocked(listPracticeQuestionsAction).mockResolvedValue([
      {
        id: "q1", sectionId: "s-line", type: "counterexample", prompt: "Συνεχής ⇒ παραγωγίσιμη", answer: "false",
        options: [{ text: "|x|", correct: true, marker: "x" }, { text: "x^2", correct: false, marker: "c" }],
        tolerance: null, sliderMin: null, sliderMax: null, sliderStep: null, graph: null, variables: null, condition: null,
        explanation: null, origin: null, originDetail: null, imagePath: null, source: "manual", sourceQuizQuestionId: null,
        position: 0, isActive: true, createdAt: "2026-11-17T10:00:00Z",
      },
    ]);
    render(<TeacherPractice initialSections={[{ ...SECTIONS[0], questionCount: 1 }]} initialProgress={[]} initialReports={[]} />);
    expect(await screen.findByText("9 answered · 33% right")).toBeInTheDocument();
    expect(screen.getByText("Wrong: 4 hyp. · 1 claim · 1 concl.")).toBeInTheDocument();
  });
});

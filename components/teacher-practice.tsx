"use client";

import * as React from "react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CopyIcon,
  DicesIcon,
  DownloadIcon,
  EyeIcon,
  EyeOffIcon,
  FileUpIcon,
  FolderInputIcon,
  GlobeIcon,
  LockIcon,
  BookMarkedIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";

import {
  copyQuizQuestionsToPracticeAction,
  getPracticeQuestionStatsAction,
  listPracticeReportsAction,
  createPracticeSectionAction,
  deletePracticeQuestionAction,
  deletePracticeSectionAction,
  importPracticeMarkdownAction,
  listCopyableQuizzesAction,
  listPracticeQuestionsAction,
  listPracticeSectionsAction,
  movePracticeQuestionsAction,
  reorderPracticeSectionsAction,
  setPracticeQuestionActiveAction,
  updatePracticeSectionAction,
} from "@/app/protected/teacher/practice-actions";
import { MathText } from "@/components/math-text";
import { PRACTICE_TYPE_LABELS, PracticeQuestionEditor } from "@/components/practice/practice-question-editor";
import { PracticeQuestionPreview } from "@/components/practice/practice-question-preview";
import { PracticeProgressView } from "@/components/practice/practice-progress-view";
import { PracticeReportsView } from "@/components/practice/practice-reports-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CLASS_GRADES } from "@/lib/class-grades";
import { getErrorMessage } from "@/lib/expected-error";
import {
  practiceImageUrl,
  type CopyableQuizQuestion,
  type PracticeQuestion,
  type PracticeReport,
  type PracticeSection,
  type PracticeStudentProgress,
} from "@/lib/practice-bank";
import { parsePracticeMarkdown } from "@/lib/practice-markdown";
import { PRACTICE_MARKDOWN_TEMPLATE } from "@/lib/practice-markdown-template";
import { instantiate, practiceOriginLabel, seededRng, type PlayableQuestion } from "@/lib/practice-template";
import { cn } from "@/lib/utils";

const SELECT_CLASS =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function safePreview(question: PracticeQuestion | Parameters<typeof instantiate>[0], seed = 1): PlayableQuestion | null {
  try {
    return instantiate(question, seededRng(seed));
  } catch {
    return null;
  }
}

/** Practice tab: the question bank, students' progress, and reports. */
export function TeacherPractice({
  initialSections,
  initialProgress,
  initialReports,
}: {
  initialSections?: PracticeSection[];
  initialProgress?: PracticeStudentProgress[];
  initialReports?: PracticeReport[];
}) {
  const [view, setView] = React.useState<"bank" | "progress" | "reports">("bank");
  const [reports, setReports] = React.useState<PracticeReport[]>(initialReports ?? []);
  const [openQuestion, setOpenQuestion] = React.useState<PracticeReport | null>(null);

  React.useEffect(() => {
    if (initialReports) return;
    listPracticeReportsAction().then(setReports).catch(() => setReports([]));
  }, [initialReports]);

  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-lg bg-muted p-1 text-sm" role="tablist" aria-label="Practice">
        {([
          ["bank", "Question bank"],
          ["progress", "Progress"],
          ["reports", reports.length ? `Reports (${reports.length})` : "Reports"],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={view === value}
            onClick={() => setView(value)}
            className={cn("rounded-md px-3 py-1.5 font-medium transition", view === value ? "bg-background shadow-xs" : "text-muted-foreground hover:text-foreground")}
          >
            {label}
          </button>
        ))}
      </div>
      {/* The bank stays mounted so its place (grade, section) survives a look at the other views. */}
      <div hidden={view !== "bank"}>
        <PracticeBank initialSections={initialSections} openQuestion={openQuestion} />
      </div>
      {view === "progress" ? <PracticeProgressView initialRows={initialProgress} /> : null}
      {view === "reports" ? (
        <PracticeReportsView
          reports={reports}
          onResolved={(id) => setReports((prev) => prev.filter((report) => report.id !== id))}
          onOpenQuestion={(report) => {
            // A fresh object each time, so the same report can be opened again.
            setOpenQuestion({ ...report });
            setView("bank");
          }}
        />
      ) : null}
    </div>
  );
}

/** The question bank by grade and section. */
function PracticeBank({
  initialSections,
  openQuestion,
}: {
  initialSections?: PracticeSection[];
  /** From a report: go to this question and open it. */
  openQuestion: PracticeReport | null;
}) {
  const [sections, setSections] = React.useState<PracticeSection[] | null>(initialSections ?? null);
  const [grade, setGrade] = React.useState<string>("lyk_b");
  const [sectionId, setSectionId] = React.useState<string | null>(null);
  // Questions of the open section, keyed by it so a switch shows "loading".
  const [loaded, setLoaded] = React.useState<{ sectionId: string; questions: PracticeQuestion[] } | null>(null);
  const [editing, setEditing] = React.useState<{ question: Partial<PracticeQuestion> | null } | null>(null);
  const [importOpen, setImportOpen] = React.useState(false);
  const [copyOpen, setCopyOpen] = React.useState(false);
  const [newSectionName, setNewSectionName] = React.useState("");
  const [renaming, setRenaming] = React.useState<string | null>(null);
  const [expanded, setExpanded] = React.useState<string | null>(null);
  // Ticked questions (of the open section) and the "Move to..." dialog.
  const [selection, setSelection] = React.useState<{ sectionId: string | null; ids: Set<string> }>({ sectionId: null, ids: new Set() });
  const [moveOpen, setMoveOpen] = React.useState(false);

  React.useEffect(() => {
    if (initialSections) return;
    listPracticeSectionsAction()
      .then((rows) => {
        setSections(rows);
        const firstGrade = CLASS_GRADES.find((item) => rows.some((row) => row.grade === item.code));
        if (firstGrade) setGrade(firstGrade.code);
      })
      .catch((error: unknown) => {
        setSections([]);
        toast.error(getErrorMessage(error, "Couldn't load the practice bank"));
      });
  }, [initialSections]);

  const gradeSections = (sections ?? []).filter((section) => section.grade === grade).sort((a, b) => a.position - b.position);
  const section = gradeSections.find((item) => item.id === sectionId) ?? null;

  // Pick the grade's first section when the grade changes or the current one goes.
  const firstId = gradeSections[0]?.id ?? null;
  if (sections && sectionId !== null && !section) setSectionId(firstId);
  if (sections && sectionId === null && firstId) setSectionId(firstId);

  const questions: PracticeQuestion[] | null = sectionId ? (loaded?.sectionId === sectionId ? loaded.questions : null) : [];
  const setQuestions = (change: (prev: PracticeQuestion[] | null) => PracticeQuestion[]) =>
    setLoaded((prev) => (prev ? { ...prev, questions: change(prev.questions) } : prev));

  const [stats, setStats] = React.useState<Record<string, { answers: number; right: number; reports: number }>>({});

  const loadQuestions = React.useCallback((id: string) => {
    getPracticeQuestionStatsAction(id).then(setStats).catch(() => setStats({}));
    listPracticeQuestionsAction(id)
      .then((rows) => setLoaded({ sectionId: id, questions: rows }))
      .catch((error: unknown) => {
        setLoaded({ sectionId: id, questions: [] });
        toast.error(getErrorMessage(error, "Couldn't load the questions"));
      });
  }, []);

  React.useEffect(() => {
    if (sectionId) loadQuestions(sectionId);
  }, [sectionId, loadQuestions]);

  // A report's "Open question": go to its section, then open the editor once
  // it's loaded. Tracked here (not by telling the parent mid-render).
  const [handledReport, setHandledReport] = React.useState<PracticeReport | null>(null);
  if (openQuestion && sections && handledReport !== openQuestion) {
    const target = sections.find((item) => item.id === openQuestion.sectionId);
    if (!target) setHandledReport(openQuestion);
    else if (grade !== target.grade) setGrade(target.grade);
    else if (sectionId !== target.id) setSectionId(target.id);
    else if (questions) {
      const question = questions.find((item) => item.id === openQuestion.questionId);
      if (question) setEditing({ question });
      setHandledReport(openQuestion);
    }
  }

  const setCount = (id: string, delta: number) =>
    setSections((prev) => (prev ?? []).map((item) => (item.id === id ? { ...item, questionCount: item.questionCount + delta } : item)));

  const selectedIds = selection.sectionId === sectionId ? selection.ids : new Set<string>();
  const toggleSelected = (id: string) =>
    setSelection(() => {
      const ids = new Set(selectedIds);
      if (ids.has(id)) ids.delete(id);
      else ids.add(id);
      return { sectionId, ids };
    });
  const clearSelection = () => setSelection({ sectionId, ids: new Set() });

  const moveSelected = async (toSectionId: string) => {
    if (!section) return;
    const ids = [...selectedIds];
    const movedActive = (questions ?? []).filter((question) => selectedIds.has(question.id) && question.isActive).length;
    try {
      await movePracticeQuestionsAction(ids, toSectionId);
      setQuestions((prev) => (prev ?? []).filter((question) => !selectedIds.has(question.id)));
      setCount(section.id, -movedActive);
      setCount(toSectionId, movedActive);
      const target = (sections ?? []).find((item) => item.id === toSectionId);
      toast.success(`Moved ${ids.length} question${ids.length === 1 ? "" : "s"} to "${target?.name ?? "the section"}"`);
      clearSelection();
      setMoveOpen(false);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Couldn't move the questions"));
    }
  };

  const addSection = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!newSectionName.trim()) return;
    try {
      const created = await createPracticeSectionAction({ grade, name: newSectionName });
      setSections((prev) => [...(prev ?? []), created]);
      setSectionId(created.id);
      setNewSectionName("");
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Couldn't add the section"));
    }
  };

  const move = async (id: string, direction: -1 | 1) => {
    const order = gradeSections.map((item) => item.id);
    const index = order.indexOf(id);
    const target = index + direction;
    if (target < 0 || target >= order.length) return;
    [order[index], order[target]] = [order[target], order[index]];
    setSections((prev) => (prev ?? []).map((item) => (order.includes(item.id) ? { ...item, position: order.indexOf(item.id) } : item)));
    try {
      await reorderPracticeSectionsAction(grade, order);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Couldn't save the order"));
    }
  };

  const togglePublic = async (target: PracticeSection) => {
    const isPublic = !target.isPublic;
    setSections((prev) => (prev ?? []).map((item) => (item.id === target.id ? { ...item, isPublic } : item)));
    try {
      await updatePracticeSectionAction(target.id, { isPublic });
      toast.success(isPublic ? "Public - guests can play it" : "Private - only your students");
    } catch (error: unknown) {
      setSections((prev) => (prev ?? []).map((item) => (item.id === target.id ? { ...item, isPublic: !isPublic } : item)));
      toast.error(getErrorMessage(error, "Couldn't change the section"));
    }
  };

  const rename = async (target: PracticeSection, name: string) => {
    setRenaming(null);
    if (!name.trim() || name.trim() === target.name) return;
    try {
      await updatePracticeSectionAction(target.id, { name });
      setSections((prev) => (prev ?? []).map((item) => (item.id === target.id ? { ...item, name: name.trim() } : item)));
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Couldn't rename the section"));
    }
  };

  const removeSection = async (target: PracticeSection) => {
    if (!window.confirm(`Delete "${target.name}" and its ${target.questionCount} question(s)?`)) return;
    try {
      await deletePracticeSectionAction(target.id);
      setSections((prev) => (prev ?? []).filter((item) => item.id !== target.id));
      setSectionId(null);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Couldn't delete the section"));
    }
  };

  const toggleActive = async (question: PracticeQuestion) => {
    const isActive = !question.isActive;
    setQuestions((prev) => (prev ?? []).map((item) => (item.id === question.id ? { ...item, isActive } : item)));
    setCount(question.sectionId, isActive ? 1 : -1);
    try {
      await setPracticeQuestionActiveAction(question.id, isActive);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Couldn't change the question"));
    }
  };

  const removeQuestion = async (question: PracticeQuestion) => {
    if (!window.confirm("Delete this question?")) return;
    try {
      await deletePracticeQuestionAction(question.id);
      setQuestions((prev) => (prev ?? []).filter((item) => item.id !== question.id));
      if (question.isActive) setCount(question.sectionId, -1);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Couldn't delete the question"));
    }
  };

  const downloadTemplate = () => {
    const blob = new Blob([PRACTICE_MARKDOWN_TEMPLATE], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "practice-template.md";
    link.click();
    URL.revokeObjectURL(url);
  };

  const gradeCounts = new Map<string, number>();
  for (const item of sections ?? []) gradeCounts.set(item.grade, (gradeCounts.get(item.grade) ?? 0) + item.questionCount);

  return (
    <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
      <Card className="self-start">
        <CardHeader className="space-y-3">
          <CardTitle className="text-base">Question bank</CardTitle>
          <div className="space-y-1">
            <Label htmlFor="practice-grade" className="text-xs text-muted-foreground">Grade</Label>
            <select id="practice-grade" className={SELECT_CLASS} value={grade} onChange={(event) => { setGrade(event.target.value); setSectionId(null); }}>
              {CLASS_GRADES.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.label}
                  {gradeCounts.get(item.code) ? ` · ${gradeCounts.get(item.code)}` : ""}
                </option>
              ))}
            </select>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {sections === null ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : gradeSections.length === 0 ? (
            <p className="text-sm text-muted-foreground">No sections for this grade yet. Add one below, or import a file.</p>
          ) : (
            <ul className="space-y-1" aria-label="Sections">
              {gradeSections.map((item, index) => (
                <li key={item.id}>
                  <div
                    className={cn(
                      "group flex items-center gap-1 rounded-md border px-2 py-1.5 text-sm",
                      item.id === sectionId ? "border-brand/60 bg-brand/5" : "border-transparent hover:bg-muted/60",
                    )}
                  >
                    <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => setSectionId(item.id)}>
                      {item.isPublic ? (
                        <GlobeIcon className="size-3.5 shrink-0 text-emerald-600" aria-label="Public" />
                      ) : (
                        <LockIcon className="size-3.5 shrink-0 text-muted-foreground" aria-label="Private" />
                      )}
                      <span className="truncate">{item.name}</span>
                      <span className="ml-auto text-xs tabular-nums text-muted-foreground">{item.questionCount}</span>
                    </button>
                    <Button type="button" variant="ghost" size="sm" className="size-6 p-0" disabled={index === 0} onClick={() => void move(item.id, -1)} aria-label={`Move ${item.name} up`}>
                      <ArrowUpIcon className="size-3.5" />
                    </Button>
                    <Button type="button" variant="ghost" size="sm" className="size-6 p-0" disabled={index === gradeSections.length - 1} onClick={() => void move(item.id, 1)} aria-label={`Move ${item.name} down`}>
                      <ArrowDownIcon className="size-3.5" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <form onSubmit={addSection} className="flex gap-2">
            <Input id="practice-new-section" value={newSectionName} onChange={(event) => setNewSectionName(event.target.value)} placeholder="New section, e.g. Παράγωγοι" aria-label="New section name" />
            <Button type="submit" size="sm" variant="outline" disabled={!newSectionName.trim()} aria-label="Add section">
              <PlusIcon className="size-4" />
            </Button>
          </form>
          <div className="grid gap-2 border-t pt-4">
            <Button type="button" variant="outline" size="sm" className="justify-start" onClick={() => setImportOpen(true)}>
              <FileUpIcon className="size-4" /> Import from file
            </Button>
            <Button type="button" variant="outline" size="sm" className="justify-start" disabled={!section} onClick={() => setCopyOpen(true)}>
              <CopyIcon className="size-4" /> Copy from quizzes
            </Button>
            <Button type="button" variant="ghost" size="sm" className="justify-start" onClick={downloadTemplate}>
              <DownloadIcon className="size-4" /> Download the template
            </Button>
            <p className="text-xs text-muted-foreground">
              The template explains the format, also to an AI: give it the template and a chapter, and import what it writes.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="min-w-0 space-y-4">
        {section ? (
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                {renaming === section.id ? (
                  <Input
                    id="practice-rename"
                    autoFocus
                    defaultValue={section.name}
                    onBlur={(event) => void rename(section, event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void rename(section, event.currentTarget.value);
                      if (event.key === "Escape") setRenaming(null);
                    }}
                    aria-label="Section name"
                  />
                ) : (
                  <CardTitle className="flex items-center gap-2 text-lg">
                    {section.name}
                    <Button type="button" variant="ghost" size="sm" className="size-7 p-0" onClick={() => setRenaming(section.id)} aria-label="Rename section">
                      <PencilIcon className="size-3.5" />
                    </Button>
                  </CardTitle>
                )}
                <p className="text-sm text-muted-foreground">
                  {CLASS_GRADES.find((item) => item.code === section.grade)?.label} · {section.questionCount} active question
                  {section.questionCount === 1 ? "" : "s"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm" htmlFor="practice-public">
                  <input id="practice-public" type="checkbox" className="size-4 accent-emerald-600" checked={section.isPublic} onChange={() => void togglePublic(section)} />
                  {section.isPublic ? "Public: guests can play it" : "Private: your students only"}
                </label>
                <Button type="button" variant="ghost" size="sm" onClick={() => void removeSection(section)}>
                  <Trash2Icon className="size-4" /> Delete section
                </Button>
                <Button type="button" onClick={() => setEditing({ question: null })}>
                  <PlusIcon className="size-4" /> New question
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {questions === null ? (
                <p className="text-sm text-muted-foreground">Loading questions…</p>
              ) : questions.length === 0 ? (
                <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                  No questions yet. Add one, copy some from your quizzes, or import a file.
                </div>
              ) : (
                <>
                <div className="mb-2 flex min-h-9 flex-wrap items-center gap-3 text-sm">
                  <label className="flex cursor-pointer items-center gap-2" htmlFor="practice-select-all">
                    <input
                      id="practice-select-all"
                      type="checkbox"
                      className="size-4 accent-emerald-600"
                      checked={selectedIds.size > 0 && selectedIds.size === questions.length}
                      onChange={() =>
                        setSelection({
                          sectionId,
                          ids: selectedIds.size === questions.length ? new Set() : new Set(questions.map((question) => question.id)),
                        })
                      }
                    />
                    {selectedIds.size ? `${selectedIds.size} selected` : "Select all"}
                  </label>
                  {selectedIds.size ? (
                    <>
                      <Button type="button" variant="outline" size="sm" onClick={() => setMoveOpen(true)}>
                        <FolderInputIcon className="size-4" /> Move to…
                      </Button>
                      <Button type="button" variant="ghost" size="sm" onClick={clearSelection}>
                        Clear
                      </Button>
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground">Tick questions to move them to another section.</span>
                  )}
                </div>
                <ol className="divide-y rounded-lg border">
                  {questions.map((question, index) => {
                    const played = expanded === question.id ? safePreview(question) : null;
                    return (
                      <li key={question.id} className={cn("px-3 py-3", !question.isActive && "bg-muted/40")}>
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            className="mt-0.5 size-4 shrink-0 accent-emerald-600"
                            checked={selectedIds.has(question.id)}
                            onChange={() => toggleSelected(question.id)}
                            aria-label={`Select question ${index + 1}`}
                          />
                          <span className="w-6 pt-0.5 text-right text-xs tabular-nums text-muted-foreground">{index + 1}</span>
                          <button
                            type="button"
                            className="min-w-0 flex-1 text-left"
                            aria-expanded={expanded === question.id}
                            onClick={() => setExpanded(expanded === question.id ? null : question.id)}
                          >
                            <span className={cn("line-clamp-2 whitespace-pre-line text-sm", !question.isActive && "text-muted-foreground")}>
                              {/* A template shows one played version - its raw {{a}} would render as a bare "a". */}
                              <MathText text={question.variables ? (safePreview(question)?.prompt ?? question.prompt) : question.prompt} />
                            </span>
                            <span className="mt-1 flex flex-wrap gap-1.5">
                              <Badge variant="outline" className="text-[11px]">{PRACTICE_TYPE_LABELS[question.type]}</Badge>
                              {question.variables ? (
                                <Badge variant="secondary" className="gap-1 text-[11px]">
                                  <DicesIcon className="size-3" aria-hidden="true" /> Random numbers
                                </Badge>
                              ) : null}
                              {question.origin ? (
                                <Badge variant="outline" className="max-w-[16rem] gap-1 border-brand/40 text-[11px]">
                                  <BookMarkedIcon className="size-3 shrink-0" aria-hidden="true" />
                                  <span className="truncate">{practiceOriginLabel(question.origin, question.originDetail)}</span>
                                </Badge>
                              ) : null}
                              {question.imagePath ? <Badge variant="outline" className="text-[11px]">Image</Badge> : null}
                              {question.source !== "manual" ? (
                                <Badge variant="outline" className="text-[11px] text-muted-foreground">
                                  {question.source === "quiz" ? "From a quiz" : "Imported"}
                                </Badge>
                              ) : null}
                              {!question.isActive ? <Badge variant="outline" className="text-[11px]">Off</Badge> : null}
                              {stats[question.id]?.answers ? (
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    "text-[11px] tabular-nums",
                                    stats[question.id].answers >= 5 && stats[question.id].right / stats[question.id].answers < 0.3 && "border-red-500/50 text-red-600 dark:text-red-400",
                                  )}
                                  title="Students' answers to this question"
                                >
                                  {stats[question.id].answers} answered · {Math.round((stats[question.id].right / stats[question.id].answers) * 100)}% right
                                </Badge>
                              ) : null}
                              {stats[question.id]?.reports ? (
                                <Badge variant="outline" className="border-amber-500/60 text-[11px] text-amber-700 dark:text-amber-400">
                                  {stats[question.id].reports} report{stats[question.id].reports === 1 ? "" : "s"}
                                </Badge>
                              ) : null}
                            </span>
                          </button>
                          <div className="flex shrink-0 items-center">
                            <Button type="button" variant="ghost" size="sm" className="size-8 p-0" onClick={() => setEditing({ question })} aria-label="Edit">
                              <PencilIcon className="size-3.5" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="size-8 p-0"
                              onClick={() => {
                                const { id: _id, ...copy } = question;
                                void _id;
                                setEditing({ question: { ...copy } });
                              }}
                              aria-label="Duplicate"
                            >
                              <CopyIcon className="size-3.5" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="size-8 p-0"
                              onClick={() => void toggleActive(question)}
                              aria-label={question.isActive ? "Switch off (never drawn)" : "Switch on"}
                              title={question.isActive ? "Switch off (never drawn)" : "Switch on"}
                            >
                              {question.isActive ? <EyeIcon className="size-3.5" /> : <EyeOffIcon className="size-3.5" />}
                            </Button>
                            <Button type="button" variant="ghost" size="sm" className="size-8 p-0" onClick={() => void removeQuestion(question)} aria-label="Delete">
                              <Trash2Icon className="size-3.5" />
                            </Button>
                          </div>
                        </div>
                        {expanded === question.id ? (
                          <div className="ml-9 mt-3 max-w-xl rounded-lg border bg-card p-3">
                            {played ? (
                              <PracticeQuestionPreview question={played} compact imageUrl={question.imagePath ? practiceImageUrl(question.imagePath) : null} />
                            ) : (
                              <p className="text-sm text-destructive">This question can&apos;t be played as it is - edit it to see why.</p>
                            )}
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ol>
                </>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              Pick or add a section for {CLASS_GRADES.find((item) => item.code === grade)?.label} to see its questions.
            </CardContent>
          </Card>
        )}
      </div>

      {section ? (
        <MoveQuestionsDialog
          key={section.id}
          open={moveOpen}
          count={selectedIds.size}
          sections={sections ?? []}
          from={section}
          onClose={() => setMoveOpen(false)}
          onMove={moveSelected}
        />
      ) : null}

      {section && editing ? (
        <PracticeQuestionEditor
          open
          sectionId={section.id}
          sectionName={`${CLASS_GRADES.find((item) => item.code === section.grade)?.label} · ${section.name}`}
          question={editing.question}
          onClose={() => setEditing(null)}
          onSaved={(saved, isNew) => {
            setQuestions((prev) => (isNew ? [...(prev ?? []), saved] : (prev ?? []).map((item) => (item.id === saved.id ? saved : item))));
            if (isNew) setCount(saved.sectionId, 1);
          }}
        />
      ) : null}

      <ImportDialog
        open={importOpen}
        grade={grade}
        sections={gradeSections}
        currentSectionId={sectionId}
        onClose={() => setImportOpen(false)}
        onImported={async (targetId) => {
          setImportOpen(false);
          const rows = await listPracticeSectionsAction().catch(() => null);
          if (rows) setSections(rows);
          setLoaded(null);
          setSectionId(targetId);
          loadQuestions(targetId);
        }}
      />

      {section ? (
        <CopyFromQuizzesDialog
          open={copyOpen}
          sectionId={section.id}
          sectionName={section.name}
          onClose={() => setCopyOpen(false)}
          onCopied={(count) => {
            setCopyOpen(false);
            setCount(section.id, count);
            loadQuestions(section.id);
          }}
        />
      ) : null}
    </div>
  );
}

/** Exported for tests/teacher-practice-dialogs.test.tsx. */
export function ImportDialog({
  open,
  grade,
  sections,
  currentSectionId,
  onClose,
  onImported,
}: {
  open: boolean;
  grade: string;
  sections: PracticeSection[];
  currentSectionId: string | null;
  onClose: () => void;
  onImported: (sectionId: string) => void;
}) {
  const [markdown, setMarkdown] = React.useState("");
  const [target, setTarget] = React.useState<string>("file");
  const [saving, setSaving] = React.useState(false);
  const [serverErrors, setServerErrors] = React.useState<string[]>([]);

  const parsed = React.useMemo(() => (markdown.trim() ? parsePracticeMarkdown(markdown) : null), [markdown]);
  const errors = serverErrors.length ? serverErrors : (parsed?.errors ?? []);
  // Where the questions go: each "# " section of the file, or all into the section picked.
  const groups = React.useMemo(() => {
    if (!parsed) return [];
    if (target !== "file") {
      const picked = sections.find((item) => item.id === target);
      return picked ? [{ name: picked.name, count: parsed.questions.length, exists: true }] : [];
    }
    const counts = new Map<string, number>();
    for (const name of parsed.sectionNames) if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
    return [...counts].map(([name, count]) => ({ name, count, exists: sections.some((item) => item.name === name) }));
  }, [parsed, target, sections]);
  const unplaced = target === "file" && parsed ? parsed.sectionNames.flatMap((name, index) => (name ? [] : [index + 1])) : [];
  const targetName = groups.length === 1 ? groups[0].name : null;
  const ready = parsed && parsed.errors.length === 0 && parsed.questions.length > 0 && groups.length > 0 && unplaced.length === 0;

  const readFile = async (file: File) => {
    setServerErrors([]);
    setMarkdown(await file.text());
  };

  const submit = async () => {
    if (!ready) return;
    setSaving(true);
    try {
      const result = await importPracticeMarkdownAction({ grade, markdown, sectionId: target === "file" ? null : target });
      if (!result.ok) {
        setServerErrors(result.errors);
        return;
      }
      const added = result.sections.filter((item) => item.created).length;
      toast.success(
        result.sections.length > 1
          ? `Imported ${result.imported} questions into ${result.sections.length} sections${added ? ` (${added} new)` : ""}`
          : `Imported ${result.imported} question${result.imported === 1 ? "" : "s"}${result.createdSection ? " into a new section" : ""}`,
      );
      setMarkdown("");
      onImported(result.sectionId);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Couldn't import the file"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !saving && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Import questions</DialogTitle>
          <DialogDescription>
            A Markdown file in the practice format (download the template for the details). Nothing is saved until the whole file is right.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Label htmlFor="practice-import-file" className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-normal">
              <FileUpIcon className="size-4" aria-hidden="true" /> Choose a .md file
            </Label>
            <input
              id="practice-import-file"
              type="file"
              accept=".md,.markdown,.txt,text/markdown,text/plain"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void readFile(file);
              }}
            />
            <span className="text-sm text-muted-foreground">or paste it below</span>
          </div>
          <Textarea
            id="practice-import-text"
            rows={8}
            value={markdown}
            onChange={(event) => {
              setServerErrors([]);
              setMarkdown(event.target.value);
            }}
            placeholder={"# Η ευθεία\n\n## Ποια είναι η κλίση της $y = 3x - 2$;\n- [x] $3$\n- [ ] $-2$"}
            className="font-mono text-xs"
          />
          <div className="space-y-1">
            <Label htmlFor="practice-import-target">Into</Label>
            <select id="practice-import-target" className={SELECT_CLASS} value={target} onChange={(event) => setTarget(event.target.value)}>
              <option value="file">
                {target === "file" && groups.length > 1
                  ? `The sections named in the file (${groups.length}), created if new`
                  : `The section named in the file${parsed?.sectionName ? ` (${parsed.sectionName})` : " (# …)"}, created if new`}
              </option>
              {sections.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                  {item.id === currentSectionId ? " (open now)" : ""}
                </option>
              ))}
            </select>
          </div>

          {errors.length ? (
            <ul className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          ) : null}
          {parsed && !errors.length ? (
            <div className="space-y-2">
              {groups.length > 1 ? (
                <div className="space-y-1.5">
                  <p className="text-sm font-medium">
                    {parsed.questions.length} questions ready for {groups.length} sections
                  </p>
                  <ul className="divide-y rounded-lg border text-sm">
                    {groups.map((group) => (
                      <li key={group.name} className="flex items-center justify-between gap-3 px-3 py-1.5">
                        <span className="min-w-0 truncate">{group.name}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {group.count} question{group.count === 1 ? "" : "s"} · {group.exists ? "adds to it" : "new section"}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-sm font-medium">
                  {parsed.questions.length} question{parsed.questions.length === 1 ? "" : "s"} ready
                  {targetName && !unplaced.length ? ` for "${targetName}"` : " - pick a section above"}
                </p>
              )}
              {unplaced.length && groups.length ? (
                <p className="text-sm text-destructive">
                  Question{unplaced.length === 1 ? "" : "s"} {unplaced.join(", ")} come{unplaced.length === 1 ? "s" : ""} before any
                  &quot;# Section name&quot; heading - add one above, or pick a section.
                </p>
              ) : null}
              <div className="grid max-h-80 gap-2 overflow-y-auto sm:grid-cols-2">
                {parsed.questions.slice(0, 8).map((question, index) => {
                  const played = safePreview(question, index + 1);
                  return played ? (
                    <div key={index} className="rounded-lg border p-3">
                      <PracticeQuestionPreview question={played} compact />
                    </div>
                  ) : null;
                })}
              </div>
              {parsed.questions.length > 8 ? (
                <p className="text-xs text-muted-foreground">…and {parsed.questions.length - 8} more.</p>
              ) : null}
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="button" onClick={() => void submit()} disabled={!ready || saving}>
            {saving ? "Importing…" : parsed?.questions.length ? `Import ${parsed.questions.length}` : "Import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Exported for tests/teacher-practice-dialogs.test.tsx. */
export function CopyFromQuizzesDialog({
  open,
  sectionId,
  sectionName,
  onClose,
  onCopied,
}: {
  open: boolean;
  sectionId: string;
  sectionName: string;
  onClose: () => void;
  onCopied: (count: number) => void;
}) {
  const [quizzes, setQuizzes] = React.useState<{ id: string; title: string; questions: CopyableQuizQuestion[] }[] | null>(null);
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const [openQuiz, setOpenQuiz] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    listCopyableQuizzesAction()
      .then((rows) => !cancelled && setQuizzes(rows))
      .catch((error: unknown) => {
        if (!cancelled) {
          setQuizzes([]);
          toast.error(getErrorMessage(error, "Couldn't load your quizzes"));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const submit = async () => {
    setSaving(true);
    try {
      const result = await copyQuizQuestionsToPracticeAction({ sectionId, quizQuestionIds: [...picked] });
      toast.success(`Copied ${result.copied}${result.skipped ? `, skipped ${result.skipped}` : ""}`);
      setPicked(new Set());
      onCopied(result.copied);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Couldn't copy the questions"));
    } finally {
      setSaving(false);
    }
  };

  const BECOMES: Record<string, string> = { choice: "Multiple choice", true_false: "True / false", number: "Number" };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !saving && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Copy from quizzes into &quot;{sectionName}&quot;</DialogTitle>
          <DialogDescription>
            They&apos;re copies: editing one later doesn&apos;t change the other. Written answers can&apos;t be checked automatically, so they stay behind -
            unless their model answer is a number.
          </DialogDescription>
        </DialogHeader>
        {quizzes === null ? (
          <p className="text-sm text-muted-foreground">Loading your quizzes…</p>
        ) : quizzes.length === 0 ? (
          <p className="text-sm text-muted-foreground">You have no quizzes yet.</p>
        ) : (
          <ul className="space-y-2">
            {quizzes.map((quiz) => {
              const copyable = quiz.questions.filter((question) => question.becomes);
              const pickedHere = copyable.filter((question) => picked.has(question.id)).length;
              return (
                <li key={quiz.id} className="rounded-lg border">
                  <div className="flex items-center gap-3 px-3 py-2">
                    <Checkbox
                      id={`quiz-all-${quiz.id}`}
                      checked={copyable.length > 0 && pickedHere === copyable.length}
                      disabled={copyable.length === 0}
                      onCheckedChange={(checked) =>
                        setPicked((prev) => {
                          const next = new Set(prev);
                          for (const question of copyable) {
                            if (checked && !question.alreadyCopied) next.add(question.id);
                            else next.delete(question.id);
                          }
                          return next;
                        })
                      }
                      aria-label={`All of ${quiz.title}`}
                    />
                    <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm font-medium" onClick={() => setOpenQuiz(openQuiz === quiz.id ? null : quiz.id)} aria-expanded={openQuiz === quiz.id}>
                      <span className="truncate"><MathText text={quiz.title} /></span>
                      <span className="ml-auto shrink-0 text-xs font-normal text-muted-foreground">
                        {pickedHere ? `${pickedHere} picked · ` : ""}{copyable.length} of {quiz.questions.length} can be copied
                      </span>
                    </button>
                  </div>
                  {openQuiz === quiz.id ? (
                    <ul className="space-y-1 border-t px-3 py-2">
                      {quiz.questions.map((question) => (
                        <li key={question.id}>
                          <label className={cn("flex items-start gap-3 py-1 text-sm", !question.becomes && "opacity-50")}>
                            <Checkbox
                              checked={picked.has(question.id)}
                              disabled={!question.becomes}
                              onCheckedChange={() => toggle(question.id)}
                            />
                            <span className="min-w-0 flex-1">
                              <span className="line-clamp-2"><MathText text={question.prompt} /></span>
                              <span className="text-xs text-muted-foreground">
                                {question.becomes ? `→ ${BECOMES[question.becomes]}` : "Written answer - stays behind"}
                                {question.alreadyCopied ? " · already copied" : ""}
                              </span>
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="button" onClick={() => void submit()} disabled={picked.size === 0 || saving}>
            {saving ? "Copying…" : `Copy ${picked.size || ""}`.trim()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** "Move to...": pick a section, of any grade, for the ticked questions. Exported for tests. */
export function MoveQuestionsDialog({
  open,
  count,
  sections,
  from,
  onClose,
  onMove,
}: {
  open: boolean;
  count: number;
  sections: PracticeSection[];
  /** The section the questions are in now. */
  from: PracticeSection;
  onClose: () => void;
  onMove: (toSectionId: string) => Promise<void>;
}) {
  const [grade, setGrade] = React.useState(from.grade);
  const [target, setTarget] = React.useState<string>("");
  const [moving, setMoving] = React.useState(false);

  const choices = sections
    .filter((item) => item.grade === grade && item.id !== from.id)
    .sort((a, b) => a.position - b.position);
  // The pick follows the grade: the first section there unless one of its own is picked.
  const picked = choices.some((item) => item.id === target) ? target : (choices[0]?.id ?? "");

  const move = async () => {
    if (!picked) return;
    setMoving(true);
    try {
      await onMove(picked);
    } finally {
      setMoving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !moving && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Move {count} question{count === 1 ? "" : "s"}
          </DialogTitle>
          <DialogDescription>From &quot;{from.name}&quot; to another section. Their answers and statistics go with them.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="practice-move-grade">Grade</Label>
            <select id="practice-move-grade" className={SELECT_CLASS} value={grade} onChange={(event) => setGrade(event.target.value)}>
              {CLASS_GRADES.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="practice-move-section">Section</Label>
            {choices.length ? (
              <select id="practice-move-section" className={SELECT_CLASS} value={picked} onChange={(event) => setTarget(event.target.value)}>
                {choices.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-sm text-muted-foreground">No other section in this grade yet - add one first.</p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={moving}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void move()} disabled={!picked || moving}>
            {moving ? "Moving…" : "Move"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

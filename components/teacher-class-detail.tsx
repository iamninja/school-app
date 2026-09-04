"use client";

import * as React from "react";
import { format } from "date-fns";
import {
  ArchiveIcon,
  PencilIcon,
  RotateCcwIcon,
  Trash2Icon,
  UserPlusIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";

import {
  getClassPendingGradingAction,
  getQuizQuestionBreakdownAction,
  getQuizResultsAction,
  getStudentQuizAttemptAction,
  gradeShortAnswerAction,
  regradeShortAnswerWithAiAction,
  setAnswerCommentAction,
} from "@/app/protected/teacher/quiz-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EDITABLE_COMMENT_LABELS, EditableComment } from "@/components/editable-comment";
import { MathText } from "@/components/math-text";
import { QuizQuestionImage } from "@/components/quiz-question-image";
import { QuizReviewAnswers } from "@/components/quiz-review-answers";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CLASS_GRADE_LABELS } from "@/lib/class-grades";
import { fromIsoDate } from "@/lib/calendar-projection";
import { lessonTimeLabel } from "@/lib/schedule-grid";
import type {
  PendingGradingItem,
  QuizAttemptAnswerReview,
  QuizAttemptReview,
  QuizQuestionBreakdownResult,
  QuizResultRow,
  TeacherQuizListItem,
  TeacherAssessmentListItem,
} from "@/lib/types/database";

// Small standalone summary, deliberately not shared with
// teacher-assessments.tsx's scheduleSummary - this tie-in only ever shows
// a one-line "when", not the full create/edit form logic that function's
// signature is shaped for.
function assessmentWhenLabel(assessment: TeacherAssessmentListItem): string {
  if (assessment.kind === "mock_exam") {
    if (!assessment.scheduled_date) return "No date set";
    const dateLabel = format(
      fromIsoDate(assessment.scheduled_date),
      "d MMM yyyy",
    );
    return assessment.scheduled_time
      ? `${dateLabel} at ${assessment.scheduled_time}`
      : dateLabel;
  }
  return assessment.deadline_at
    ? `Due ${format(new Date(assessment.deadline_at), "d MMM yyyy, HH:mm")}`
    : "Open (no deadline)";
}

const DAY_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

type ClassItem = {
  id: string;
  name: string;
  hoursPerWeek: number;
  grade: string | null;
  color: string;
  archivedAt: string | null;
};

type StudentItem = {
  id: string;
  firstName: string;
  lastName: string;
  gradeLevel: string;
};

type TeacherClassDetailProps = {
  classItem: ClassItem;
  scheduledSlots: { day: string; time: string; isTwoHour?: boolean }[];
  enrolledStudents: StudentItem[];
  allStudents: StudentItem[];
  assignedQuizzes: TeacherQuizListItem[];
  assignedAssessments: TeacherAssessmentListItem[];
  isSavingClass: boolean;
  isMutatingEnrollment: boolean;
  onBack: () => void;
  onEdit: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onDelete: () => void;
  onViewStudent: (studentId: string) => void;
  onGoToQuizzes: () => void;
  onGoToAssessments: (assessmentId?: string) => void;
  onEnrollStudent: (studentId: string) => void;
  onUnenrollStudent: (studentId: string) => void;
};

export function TeacherClassDetail({
  classItem,
  scheduledSlots,
  enrolledStudents,
  allStudents,
  assignedQuizzes,
  assignedAssessments,
  isSavingClass,
  isMutatingEnrollment,
  onBack,
  onEdit,
  onArchive,
  onRestore,
  onDelete,
  onViewStudent,
  onGoToQuizzes,
  onGoToAssessments,
  onEnrollStudent,
  onUnenrollStudent,
}: TeacherClassDetailProps) {
  const [isManageStudentsOpen, setIsManageStudentsOpen] = React.useState(false);

  // Class-wide pending-review counts, just for the "N pending review" badge
  // on each row in the "Assigned quizzes" list - independent of whichever
  // quiz's dialog (if any) is currently open.
  const [pendingGrading, setPendingGrading] = React.useState<
    PendingGradingItem[] | null
  >(null);

  // The quiz-review dialog: per-student tabs (full answer review, grading,
  // comments) plus a per-question breakdown view across the class.
  const [viewingQuizId, setViewingQuizId] = React.useState<string | null>(
    null,
  );
  const [viewMode, setViewMode] = React.useState<"students" | "breakdown">(
    "students",
  );
  const [quizResults, setQuizResults] = React.useState<QuizResultRow[] | null>(
    null,
  );
  const [isLoadingResults, setIsLoadingResults] = React.useState(false);
  const [selectedStudentId, setSelectedStudentId] = React.useState<
    string | null
  >(null);
  const [studentReview, setStudentReview] =
    React.useState<QuizAttemptReview | null>(null);
  const [isLoadingStudentReview, setIsLoadingStudentReview] =
    React.useState(false);
  const [breakdown, setBreakdown] =
    React.useState<QuizQuestionBreakdownResult | null>(null);
  const [isLoadingBreakdown, setIsLoadingBreakdown] = React.useState(false);
  const [gradingAnswerId, setGradingAnswerId] = React.useState<string | null>(
    null,
  );

  const enrolledIds = new Set(enrolledStudents.map((student) => student.id));

  const loadPendingGrading = React.useCallback(async () => {
    try {
      const items = await getClassPendingGradingAction(classItem.id);
      setPendingGrading(items);
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : "Failed to load pending grading",
      );
    }
  }, [classItem.id]);

  React.useEffect(() => {
    // Fetching this class's pending grading when it's opened is a real
    // "synchronize with an external system" effect, not derived state -
    // same exception category already established in this codebase for
    // the family ledger dialog and the quiz-timer countdown reset.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadPendingGrading();
  }, [loadPendingGrading]);

  const pendingCountByQuiz = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const item of pendingGrading ?? []) {
      map.set(item.quizId, (map.get(item.quizId) ?? 0) + 1);
    }
    return map;
  }, [pendingGrading]);

  const viewingQuiz = assignedQuizzes.find((quiz) => quiz.id === viewingQuizId);

  const handleSelectStudent = async (quizId: string, row: QuizResultRow) => {
    setSelectedStudentId(row.studentId);
    setStudentReview(null);
    if (!row.completed) {
      return;
    }
    setIsLoadingStudentReview(true);
    try {
      const review = await getStudentQuizAttemptAction(quizId, row.studentId);
      setStudentReview(review);
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : "Failed to load answers",
      );
    } finally {
      setIsLoadingStudentReview(false);
    }
  };

  const handleOpenQuiz = async (quizId: string) => {
    setViewingQuizId(quizId);
    setViewMode("students");
    setQuizResults(null);
    setSelectedStudentId(null);
    setStudentReview(null);
    setBreakdown(null);
    setIsLoadingResults(true);
    try {
      const data = await getQuizResultsAction(quizId);
      const classRows = data.results.filter((row) =>
        enrolledIds.has(row.studentId),
      );
      setQuizResults(classRows);
      const initial = classRows.find((row) => row.completed) ?? classRows[0];
      if (initial) {
        void handleSelectStudent(quizId, initial);
      }
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : "Failed to load quiz results",
      );
    } finally {
      setIsLoadingResults(false);
    }
  };

  const handleOpenBreakdown = async () => {
    setViewMode("breakdown");
    if (breakdown || !viewingQuizId) {
      return;
    }
    setIsLoadingBreakdown(true);
    try {
      const data = await getQuizQuestionBreakdownAction(viewingQuizId);
      setBreakdown(data);
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : "Failed to load breakdown",
      );
    } finally {
      setIsLoadingBreakdown(false);
    }
  };

  const handleSaveAnswerComment = async (
    table: "attempt" | "best",
    answer: QuizAttemptAnswerReview,
    comment: string | null,
  ) => {
    try {
      await setAnswerCommentAction(answer.answerId, comment, table);
      setStudentReview((prev) => {
        if (!prev) return prev;
        const patch = (row: QuizAttemptAnswerReview) =>
          row.questionId === answer.questionId
            ? { ...row, teacherComment: comment }
            : row;
        if (table === "attempt") {
          return { ...prev, answers: prev.answers.map(patch) };
        }
        if (!prev.best) return prev;
        return { ...prev, best: { ...prev.best, answers: prev.best.answers.map(patch) } };
      });
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save comment",
      );
    }
  };

  // Shared by both a manual grade/override and an AI re-grade - refreshes
  // whichever student's review is open plus the class-wide pending count
  // and the results-table badge, since either action can change all three.
  const refreshAfterGrading = async () => {
    if (!viewingQuizId || !selectedStudentId) return;
    const [review] = await Promise.all([
      getStudentQuizAttemptAction(viewingQuizId, selectedStudentId),
      loadPendingGrading(),
    ]);
    setStudentReview(review);
    const pendingCount = review.answers.filter(
      (row) => row.isCorrect === null,
    ).length;
    setQuizResults(
      (prev) =>
        prev?.map((row) =>
          row.studentId === selectedStudentId
            ? { ...row, score: review.score, pendingShortAnswerCount: pendingCount }
            : row,
        ) ?? null,
    );
  };

  const handleGradeAnswer = async (
    answer: QuizAttemptAnswerReview,
    isCorrect: boolean,
  ) => {
    if (!viewingQuizId || !selectedStudentId) return;
    setGradingAnswerId(answer.answerId);
    try {
      await gradeShortAnswerAction(answer.answerId, isCorrect);
      await refreshAfterGrading();
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save grade",
      );
    } finally {
      setGradingAnswerId(null);
    }
  };

  const handleRegradeWithAi = async (answer: QuizAttemptAnswerReview) => {
    if (!viewingQuizId || !selectedStudentId) return;
    setGradingAnswerId(answer.answerId);
    try {
      await regradeShortAnswerWithAiAction(answer.answerId);
      await refreshAfterGrading();
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : "AI grading failed",
      );
    } finally {
      setGradingAnswerId(null);
    }
  };

  const handleSaveBreakdownComment = async (
    questionId: string,
    answerId: string,
    comment: string | null,
  ) => {
    try {
      // The breakdown view only ever reads quiz_attempt_answers (the first/
      // official attempt) - see getQuizQuestionBreakdownAction.
      await setAnswerCommentAction(answerId, comment, "attempt");
      setBreakdown((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          questions: prev.questions.map((question) =>
            question.questionId === questionId
              ? {
                  ...question,
                  studentAnswers: question.studentAnswers.map((row) =>
                    row.answerId === answerId
                      ? { ...row, teacherComment: comment }
                      : row,
                  ),
                }
              : question,
          ),
        };
      });
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save comment",
      );
    }
  };

  const closeQuizDialog = () => {
    setViewingQuizId(null);
    setQuizResults(null);
    setSelectedStudentId(null);
    setStudentReview(null);
    setBreakdown(null);
  };

  const sortedSlots = [...scheduledSlots].sort((a, b) => {
    const dayDiff = DAY_ORDER.indexOf(a.day as (typeof DAY_ORDER)[number]) -
      DAY_ORDER.indexOf(b.day as (typeof DAY_ORDER)[number]);
    return dayDiff !== 0 ? dayDiff : a.time.localeCompare(b.time);
  });

  return (
    <div className="animate-in fade-in slide-in-from-right-8 duration-300">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <span
                className={
                  "inline-block size-2.5 shrink-0 rounded-full border " +
                  classItem.color
                }
                aria-hidden="true"
              />
              {classItem.name}
              {classItem.archivedAt ? (
                <Badge variant="secondary">Archived</Badge>
              ) : (
                <Badge variant="outline">Active</Badge>
              )}
            </CardTitle>
            <div className="text-sm text-muted-foreground">
              {classItem.hoursPerWeek} hours/week &middot;{" "}
              {sortedSlots.length} of {classItem.hoursPerWeek} slots scheduled
              {classItem.grade
                ? ` · ${CLASS_GRADE_LABELS[classItem.grade] ?? classItem.grade}`
                : ""}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onEdit}
              disabled={isSavingClass}
            >
              <PencilIcon className="mr-1 h-3.5 w-3.5" /> Edit
            </Button>
            {classItem.archivedAt ? (
              <Button
                type="button"
                variant="outline"
                onClick={onRestore}
                disabled={isSavingClass}
              >
                <RotateCcwIcon className="mr-1 h-3.5 w-3.5" /> Restore
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                onClick={onArchive}
                disabled={isSavingClass}
              >
                <ArchiveIcon className="mr-1 h-3.5 w-3.5" /> Archive
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={onDelete}
              disabled={isSavingClass}
            >
              <Trash2Icon className="mr-1 h-3.5 w-3.5" /> Delete
            </Button>
            <Button type="button" variant="outline" onClick={onBack}>
              Back to classes
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-4">
            <div className="rounded-lg border p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Enrolled students
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsManageStudentsOpen(true)}
                >
                  <UserPlusIcon className="mr-1 h-3.5 w-3.5" /> Enroll
                  students
                </Button>
              </div>
              <div className="mt-3 space-y-2">
                {enrolledStudents.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No students enrolled in this class.
                  </p>
                ) : (
                  enrolledStudents.map((student) => (
                    <div
                      key={student.id}
                      className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm"
                    >
                      <button
                        type="button"
                        onClick={() => onViewStudent(student.id)}
                        className="flex flex-1 items-center justify-between gap-2 text-left hover:underline"
                      >
                        <span className="font-medium">
                          {student.firstName} {student.lastName}
                        </span>
                        <span className="flex items-center gap-2 text-xs text-muted-foreground">
                          Grade {student.gradeLevel || "N/A"}
                        </span>
                      </button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="ml-2 h-7 w-7 shrink-0 p-0"
                        disabled={isMutatingEnrollment}
                        onClick={(event) => {
                          event.stopPropagation();
                          onUnenrollStudent(student.id);
                        }}
                        aria-label={`Remove ${student.firstName} ${student.lastName} from this class`}
                      >
                        <XIcon className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-lg border p-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Schedule
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {sortedSlots.length === 0 ? (
                  <span className="text-xs text-muted-foreground">
                    Not yet scheduled.
                  </span>
                ) : (
                  sortedSlots.map((slot) => (
                    <Badge key={`${slot.day}-${slot.time}`} variant="outline">
                      {slot.day} &middot;{" "}
                      {lessonTimeLabel(slot.time, slot.isTwoHour ?? false)}
                    </Badge>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-lg border p-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Assigned quizzes
              </div>
              <div className="mt-3 space-y-2">
                {assignedQuizzes.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No quizzes assigned to this class.
                  </p>
                ) : (
                  assignedQuizzes.map((quiz) => {
                    const pendingCount = pendingCountByQuiz.get(quiz.id) ?? 0;
                    return (
                      <button
                        key={quiz.id}
                        type="button"
                        onClick={() => void handleOpenQuiz(quiz.id)}
                        className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm hover:bg-muted/50"
                      >
                        <span className="font-medium">
                          <MathText text={quiz.title} />
                        </span>
                        <span className="flex items-center gap-2 text-xs text-muted-foreground">
                          {pendingCount > 0 && (
                            <Badge variant="destructive">
                              {pendingCount} pending review
                            </Badge>
                          )}
                          {quiz.hasAttempts && (
                            <Badge variant="secondary">Locked</Badge>
                          )}
                          {quiz.timeLimitMinutes !== null && (
                            <Badge variant="outline">
                              &#9201; {quiz.timeLimitMinutes} min
                            </Badge>
                          )}
                          <Badge variant="outline">
                            {quiz.questionCount} questions
                          </Badge>
                        </span>
                      </button>
                    );
                  })
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={onGoToQuizzes}
                >
                  Go to Quizzes &rarr;
                </Button>
              </div>
            </div>

            <div className="rounded-lg border p-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Assigned assessments
              </div>
              <div className="mt-3 space-y-2">
                {assignedAssessments.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No assessments assigned to this class.
                  </p>
                ) : (
                  assignedAssessments.map((assessment) => (
                    <button
                      key={assessment.id}
                      type="button"
                      onClick={() => onGoToAssessments(assessment.id)}
                      className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm hover:bg-muted/50"
                    >
                      <span className="font-medium">{assessment.title}</span>
                      <span className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="outline">
                          {assessment.kind === "mock_exam"
                            ? "Mock exam"
                            : "Short assessment"}
                        </Badge>
                        {assessmentWhenLabel(assessment)}
                      </span>
                    </button>
                  ))
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => onGoToAssessments()}
                >
                  Go to Assessments &rarr;
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={isManageStudentsOpen}
        onOpenChange={setIsManageStudentsOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enroll students — {classItem.name}</DialogTitle>
          </DialogHeader>
          <div className="grid max-h-[60vh] gap-2 overflow-y-auto">
            {allStudents.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No students on the roster yet.
              </p>
            ) : (
              allStudents.map((student) => {
                const isEnrolled = enrolledIds.has(student.id);
                return (
                  <label
                    key={student.id}
                    className="flex items-center gap-3 rounded-md border p-3 text-sm"
                  >
                    <Checkbox
                      checked={isEnrolled}
                      disabled={isMutatingEnrollment}
                      onCheckedChange={() =>
                        isEnrolled
                          ? onUnenrollStudent(student.id)
                          : onEnrollStudent(student.id)
                      }
                    />
                    <span className="flex-1">
                      {student.firstName} {student.lastName}
                    </span>
                  </label>
                );
              })
            )}
          </div>
          <DialogFooter showCloseButton />
        </DialogContent>
      </Dialog>

      <Dialog
        open={viewingQuizId !== null}
        onOpenChange={(open) => !open && closeQuizDialog()}
      >
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {viewingQuiz ? <MathText text={viewingQuiz.title} /> : "Quiz"}
            </DialogTitle>
          </DialogHeader>

          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={viewMode === "students" ? "default" : "outline"}
              onClick={() => setViewMode("students")}
            >
              By student
            </Button>
            <Button
              type="button"
              size="sm"
              variant={viewMode === "breakdown" ? "default" : "outline"}
              onClick={() => void handleOpenBreakdown()}
            >
              By question
            </Button>
          </div>

          {viewMode === "students" ? (
            isLoadingResults ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : !quizResults || quizResults.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No students enrolled in this class.
              </p>
            ) : (
              <Tabs
                value={selectedStudentId ?? undefined}
                onValueChange={(studentId) => {
                  const row = quizResults.find(
                    (result) => result.studentId === studentId,
                  );
                  if (row && viewingQuizId) {
                    void handleSelectStudent(viewingQuizId, row);
                  }
                }}
              >
                <div className="overflow-x-auto">
                  <TabsList variant="line" className="w-max">
                    {quizResults.map((row) => (
                      <TabsTrigger
                        key={row.studentId}
                        value={row.studentId}
                        className={
                          row.pendingShortAnswerCount > 0
                            ? "text-destructive data-[state=active]:text-destructive"
                            : undefined
                        }
                      >
                        {row.studentName}
                        {row.pendingShortAnswerCount > 0 && (
                          <span
                            className="ml-1 inline-block size-1.5 shrink-0 rounded-full bg-destructive"
                            aria-hidden="true"
                          />
                        )}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </div>
                {quizResults.map((row) => (
                  <TabsContent
                    key={row.studentId}
                    value={row.studentId}
                    className="max-h-[55vh] space-y-3 overflow-y-auto"
                  >
                    {!row.completed ? (
                      <p className="text-sm text-muted-foreground">
                        Hasn&apos;t submitted this quiz yet.
                      </p>
                    ) : selectedStudentId !== row.studentId ||
                      isLoadingStudentReview ? (
                      <p className="text-sm text-muted-foreground">
                        Loading...
                      </p>
                    ) : studentReview ? (
                      <>
                        <p className="text-2xl font-bold">
                          {studentReview.score} / {studentReview.maxScore}
                        </p>
                        {studentReview.attemptsUsed > 1 && (
                          <p className="text-xs text-muted-foreground">
                            {studentReview.attemptsUsed} attempts used
                            {studentReview.best &&
                              ` — best: ${studentReview.best.score} / ${studentReview.maxScore}`}
                          </p>
                        )}
                        <div>
                          <p className="mb-2 text-sm font-medium">
                            First attempt
                          </p>
                          <QuizReviewAnswers
                            answers={studentReview.answers}
                            onSaveComment={(answer, comment) =>
                              handleSaveAnswerComment(
                                "attempt",
                                answer,
                                comment,
                              )
                            }
                            onGrade={handleGradeAnswer}
                            onRegradeWithAi={handleRegradeWithAi}
                            gradingAnswerId={gradingAnswerId}
                          />
                        </div>
                        {studentReview.best && (
                          <div>
                            <p className="mb-2 text-sm font-medium">
                              Best attempt
                            </p>
                            <QuizReviewAnswers
                              answers={studentReview.best.answers}
                              onSaveComment={(answer, comment) =>
                                handleSaveAnswerComment(
                                  "best",
                                  answer,
                                  comment,
                                )
                              }
                            />
                          </div>
                        )}
                      </>
                    ) : null}
                  </TabsContent>
                ))}
              </Tabs>
            )
          ) : (
            <div className="max-h-[65vh] space-y-4 overflow-y-auto">
              {isLoadingBreakdown ? (
                <p className="text-sm text-muted-foreground">Loading...</p>
              ) : breakdown && breakdown.questions.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  This quiz has no questions yet.
                </p>
              ) : (
                breakdown?.questions.map((question, index) => {
                  const respondents = question.studentAnswers.length;
                  return (
                    <div
                      key={question.questionId}
                      className="space-y-3 rounded-lg border p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold">
                          {index + 1}.{" "}
                          <MathText text={question.questionText} />
                        </p>
                        <Badge variant="outline">
                          {question.points} pt
                          {question.points === 1 ? "" : "s"}
                        </Badge>
                      </div>

                      {question.imageUrl && (
                        <QuizQuestionImage imageUrl={question.imageUrl} />
                      )}

                      {respondents === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          No submissions yet.
                        </p>
                      ) : (
                        <>
                          {question.optionBreakdown.length > 0 && (
                            <div className="space-y-1">
                              {question.optionBreakdown.map((option) => (
                                <div
                                  key={option.optionId}
                                  className={
                                    "flex items-center justify-between rounded-md border px-3 py-1.5 text-sm " +
                                    (option.isCorrect
                                      ? "border-green-200 bg-green-50 text-green-950 dark:border-green-900 dark:bg-green-950 dark:text-green-50"
                                      : "")
                                  }
                                >
                                  <span>
                                    <MathText text={option.optionText} />
                                  </span>
                                  <Badge
                                    variant={
                                      option.isCorrect
                                        ? "default"
                                        : "secondary"
                                    }
                                  >
                                    {option.count} / {respondents}
                                  </Badge>
                                </div>
                              ))}
                            </div>
                          )}

                          <div className="space-y-1">
                            <p className="text-xs font-medium text-muted-foreground">
                              Student answers
                            </p>
                            {question.studentAnswers.map((answer) => (
                              <div
                                key={answer.answerId}
                                className="rounded-md border px-3 py-1.5 text-sm"
                              >
                                <div className="flex items-center justify-between">
                                  <span>{answer.studentName}</span>
                                  <span className="flex items-center gap-2">
                                    <span className="text-muted-foreground">
                                      {answer.selectedOptionText ? (
                                        <MathText
                                          text={answer.selectedOptionText}
                                        />
                                      ) : (
                                        answer.textAnswer || "(no answer)"
                                      )}
                                    </span>
                                    {answer.isCorrect === true && (
                                      <Badge>Correct</Badge>
                                    )}
                                    {answer.isCorrect === false && (
                                      <Badge variant="destructive">
                                        Incorrect
                                      </Badge>
                                    )}
                                    {answer.isCorrect === null &&
                                      question.questionType ===
                                        "short_answer" && (
                                        <Badge variant="outline">
                                          Awaiting review
                                        </Badge>
                                      )}
                                  </span>
                                </div>
                                <EditableComment
                                  comment={answer.teacherComment}
                                  labels={EDITABLE_COMMENT_LABELS.en}
                                  onSave={(comment) =>
                                    handleSaveBreakdownComment(
                                      question.questionId,
                                      answer.answerId,
                                      comment,
                                    )
                                  }
                                />
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

          <DialogFooter showCloseButton />
        </DialogContent>
      </Dialog>
    </div>
  );
}

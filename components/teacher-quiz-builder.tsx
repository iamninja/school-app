"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  BarChart3Icon,
  CopyIcon,
  PencilIcon,
  PlusIcon,
  UsersIcon,
} from "lucide-react";

import {
  assignQuizToClassAction,
  createQuizAction,
  duplicateQuizAction,
  getQuizForEditingAction,
  getQuizQuestionBreakdownAction,
  getQuizResultsAction,
  getStudentQuizAttemptAction,
  unassignQuizFromClassAction,
  updateQuizAction,
} from "@/app/protected/teacher/quiz-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QuizReviewAnswers } from "@/components/quiz-review-answers";
import {
  createBlankQuestion,
  draftsToQuestionInputs,
  questionInputsToDrafts,
  useQuestionDrafts,
  validateQuestionDrafts,
  QuizQuestionEditor,
} from "@/components/quiz-question-editor";
import type {
  QuizAttemptReview,
  QuizQuestionBreakdownResult,
  QuizResults,
  TeacherQuizListItem,
} from "@/lib/types/database";

type ClassOption = { id: string; name: string };

export function TeacherQuizBuilder({
  classes,
  initialQuizzes,
}: {
  classes: ClassOption[];
  initialQuizzes: TeacherQuizListItem[];
}) {
  const [quizzes, setQuizzes] =
    React.useState<TeacherQuizListItem[]>(initialQuizzes);
  const [isCreateOpen, setIsCreateOpen] = React.useState(false);
  const [classIds, setClassIds] = React.useState<string[]>([]);
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const createDraft = useQuestionDrafts();
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [selectedQuizId, setSelectedQuizId] = React.useState<string | null>(
    null,
  );
  const [results, setResults] = React.useState<QuizResults | null>(null);
  const [isLoadingResults, setIsLoadingResults] = React.useState(false);
  const [viewingStudent, setViewingStudent] = React.useState<{
    studentId: string;
    studentName: string;
  } | null>(null);
  const [studentReview, setStudentReview] =
    React.useState<QuizAttemptReview | null>(null);
  const [isLoadingAttempt, setIsLoadingAttempt] = React.useState(false);

  const [manageQuizId, setManageQuizId] = React.useState<string | null>(null);
  const [isTogglingAssignment, setIsTogglingAssignment] =
    React.useState(false);

  const [editQuizId, setEditQuizId] = React.useState<string | null>(null);
  const [editTitle, setEditTitle] = React.useState("");
  const [editDescription, setEditDescription] = React.useState("");
  const [editLocked, setEditLocked] = React.useState(false);
  const [isLoadingEdit, setIsLoadingEdit] = React.useState(false);
  const [isSavingEdit, setIsSavingEdit] = React.useState(false);
  const editDraft = useQuestionDrafts();

  const [duplicatingQuizId, setDuplicatingQuizId] = React.useState<
    string | null
  >(null);

  const [breakdownQuizId, setBreakdownQuizId] = React.useState<string | null>(
    null,
  );
  const [breakdown, setBreakdown] =
    React.useState<QuizQuestionBreakdownResult | null>(null);
  const [isLoadingBreakdown, setIsLoadingBreakdown] = React.useState(false);

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setClassIds([]);
    createDraft.setQuestions([createBlankQuestion()]);
  };

  const handleToggleCreateClass = (classId: string) => {
    setClassIds((prev) =>
      prev.includes(classId)
        ? prev.filter((id) => id !== classId)
        : [...prev, classId],
    );
  };

  const handleCreateQuiz = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!title.trim()) {
      toast.error("Give the quiz a title");
      return;
    }

    const validationError = validateQuestionDrafts(createDraft.questions);
    if (validationError) {
      toast.error(validationError);
      return;
    }

    setIsSubmitting(true);
    try {
      const created = await createQuizAction({
        classIds,
        title: title.trim(),
        description: description.trim() || undefined,
        questions: draftsToQuestionInputs(createDraft.questions),
      });

      setQuizzes((prev) => [created, ...prev]);
      resetForm();
      setIsCreateOpen(false);
      toast.success("Quiz created");
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : "Failed to create quiz",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSelectQuiz = async (quizId: string) => {
    setSelectedQuizId(quizId);
    setIsLoadingResults(true);
    setResults(null);
    try {
      const data = await getQuizResultsAction(quizId);
      setResults(data);
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : "Failed to load results",
      );
    } finally {
      setIsLoadingResults(false);
    }
  };

  const handleViewStudentAnswers = async (
    studentId: string,
    studentName: string,
  ) => {
    if (!selectedQuizId) {
      return;
    }
    setViewingStudent({ studentId, studentName });
    setIsLoadingAttempt(true);
    setStudentReview(null);
    try {
      const review = await getStudentQuizAttemptAction(
        selectedQuizId,
        studentId,
      );
      setStudentReview(review);
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : "Failed to load answers",
      );
    } finally {
      setIsLoadingAttempt(false);
    }
  };

  const managedQuiz = quizzes.find((quiz) => quiz.id === manageQuizId) ?? null;

  const handleToggleAssignment = async (
    classId: string,
    isAssigned: boolean,
  ) => {
    if (!manageQuizId) return;
    setIsTogglingAssignment(true);
    try {
      if (isAssigned) {
        await unassignQuizFromClassAction(manageQuizId, classId);
      } else {
        await assignQuizToClassAction(manageQuizId, classId);
      }
      setQuizzes((prev) =>
        prev.map((quiz) => {
          if (quiz.id !== manageQuizId) return quiz;
          if (isAssigned) {
            return {
              ...quiz,
              assignedClasses: quiz.assignedClasses.filter(
                (c) => c.id !== classId,
              ),
            };
          }
          const classOption = classes.find((c) => c.id === classId);
          return {
            ...quiz,
            assignedClasses: [
              ...quiz.assignedClasses,
              { id: classId, name: classOption?.name ?? "" },
            ],
          };
        }),
      );
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : "Failed to update assignment",
      );
    } finally {
      setIsTogglingAssignment(false);
    }
  };

  const openEditDialog = async (quizId: string) => {
    setEditQuizId(quizId);
    setIsLoadingEdit(true);
    try {
      const data = await getQuizForEditingAction(quizId);
      setEditTitle(data.title);
      setEditDescription(data.description ?? "");
      setEditLocked(data.locked);
      editDraft.setQuestions(questionInputsToDrafts(data.questions));
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : "Failed to load quiz",
      );
      setEditQuizId(null);
    } finally {
      setIsLoadingEdit(false);
    }
  };

  const closeEditDialog = () => {
    setEditQuizId(null);
  };

  const handleSaveEdit = async () => {
    if (!editQuizId) return;
    if (!editTitle.trim()) {
      toast.error("Give the quiz a title");
      return;
    }

    if (!editLocked) {
      const validationError = validateQuestionDrafts(editDraft.questions);
      if (validationError) {
        toast.error(validationError);
        return;
      }
    }

    setIsSavingEdit(true);
    try {
      const updated = await updateQuizAction({
        quizId: editQuizId,
        title: editTitle.trim(),
        description: editDescription.trim() || undefined,
        questions: editLocked
          ? undefined
          : draftsToQuestionInputs(editDraft.questions),
      });
      setQuizzes((prev) =>
        prev.map((quiz) => (quiz.id === updated.id ? updated : quiz)),
      );
      toast.success("Quiz updated");
      closeEditDialog();
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : "Failed to update quiz",
      );
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleViewBreakdown = async (quizId: string) => {
    setBreakdownQuizId(quizId);
    setIsLoadingBreakdown(true);
    setBreakdown(null);
    try {
      const data = await getQuizQuestionBreakdownAction(quizId);
      setBreakdown(data);
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : "Failed to load breakdown",
      );
    } finally {
      setIsLoadingBreakdown(false);
    }
  };

  const handleDuplicate = async (quizId: string) => {
    setDuplicatingQuizId(quizId);
    try {
      const copy = await duplicateQuizAction(quizId);
      setQuizzes((prev) => [copy, ...prev]);
      toast.success("Quiz copied — edit the copy to make changes");
      closeEditDialog();
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : "Failed to copy quiz",
      );
    } finally {
      setDuplicatingQuizId(null);
    }
  };

  if (viewingStudent) {
    return (
      <div className="space-y-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setViewingStudent(null);
            setStudentReview(null);
          }}
        >
          Back to results
        </Button>
        <Card>
          <CardHeader>
            <CardTitle>{viewingStudent.studentName}&apos;s answers</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoadingAttempt ? (
              <p className="text-sm text-muted-foreground">
                Loading answers...
              </p>
            ) : studentReview ? (
              <>
                <p className="text-2xl font-bold">
                  {studentReview.score} / {studentReview.maxScore}
                </p>
                <QuizReviewAnswers answers={studentReview.answers} />
              </>
            ) : null}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (breakdownQuizId) {
    return (
      <div className="space-y-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setBreakdownQuizId(null);
            setBreakdown(null);
          }}
        >
          Back to quizzes
        </Button>
        <Card>
          <CardHeader>
            <CardTitle>
              {breakdown?.quizTitle ?? "Loading..."} — Question breakdown
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {isLoadingBreakdown ? (
              <p className="text-sm text-muted-foreground">
                Loading breakdown...
              </p>
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
                        {index + 1}. {question.questionText}
                      </p>
                      <Badge variant="outline">
                        {question.points} pt{question.points === 1 ? "" : "s"}
                      </Badge>
                    </div>

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
                                <span>{option.optionText}</span>
                                <Badge
                                  variant={
                                    option.isCorrect ? "default" : "secondary"
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
                              key={answer.studentId}
                              className="flex items-center justify-between rounded-md border px-3 py-1.5 text-sm"
                            >
                              <span>{answer.studentName}</span>
                              <span className="flex items-center gap-2">
                                <span className="text-muted-foreground">
                                  {answer.selectedOptionText ??
                                    answer.textAnswer ??
                                    "(no answer)"}
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
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (selectedQuizId) {
    return (
      <div className="space-y-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setSelectedQuizId(null);
            setResults(null);
          }}
        >
          Back to quizzes
        </Button>
        <Card>
          <CardHeader>
            <CardTitle>{results?.quizTitle ?? "Loading..."}</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingResults ? (
              <p className="text-sm text-muted-foreground">
                Loading results...
              </p>
            ) : results && results.results.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No students assigned to this quiz&apos;s classes yet.
              </p>
            ) : (
              <div className="space-y-2">
                {results?.results.map((row) => (
                  <div
                    key={row.studentId}
                    className="flex items-center justify-between rounded-md border px-3 py-2"
                  >
                    <div>
                      <p className="text-sm font-medium">{row.studentName}</p>
                      {row.submittedAt && (
                        <p className="text-xs text-muted-foreground">
                          Submitted{" "}
                          {new Date(row.submittedAt).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {row.pendingShortAnswerCount > 0 && (
                        <Badge variant="secondary">
                          {row.pendingShortAnswerCount} pending review
                        </Badge>
                      )}
                      {row.completed ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            handleViewStudentAnswers(
                              row.studentId,
                              row.studentName,
                            )
                          }
                        >
                          {row.score} / {row.maxScore} · View answers
                        </Button>
                      ) : (
                        <Badge variant="outline">Not started</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle>Your Quizzes</CardTitle>
          <Button type="button" size="sm" onClick={() => setIsCreateOpen(true)}>
            <PlusIcon className="mr-1 h-3.5 w-3.5" /> New quiz
          </Button>
        </CardHeader>
        <CardContent>
          {quizzes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No quizzes created yet.
            </p>
          ) : (
            <div className="space-y-2">
              {quizzes.map((quiz) => (
                <div key={quiz.id} className="space-y-2 rounded-md border p-3">
                  <button
                    type="button"
                    onClick={() => handleSelectQuiz(quiz.id)}
                    className="flex w-full items-center justify-between text-left"
                  >
                    <div>
                      <p className="text-sm font-medium">{quiz.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {quiz.assignedClasses.length > 0
                          ? quiz.assignedClasses.map((c) => c.name).join(", ")
                          : "Unassigned"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {quiz.hasAttempts && (
                        <Badge variant="secondary">Locked</Badge>
                      )}
                      <Badge variant="outline">
                        {quiz.questionCount} questions
                      </Badge>
                    </div>
                  </button>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setManageQuizId(quiz.id)}
                    >
                      <UsersIcon className="mr-1 h-3.5 w-3.5" /> Manage classes
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => openEditDialog(quiz.id)}
                    >
                      <PencilIcon className="mr-1 h-3.5 w-3.5" /> Edit
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleViewBreakdown(quiz.id)}
                    >
                      <BarChart3Icon className="mr-1 h-3.5 w-3.5" /> Question
                      breakdown
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={duplicatingQuizId === quiz.id}
                      onClick={() => handleDuplicate(quiz.id)}
                    >
                      <CopyIcon className="mr-1 h-3.5 w-3.5" />
                      {duplicatingQuizId === quiz.id ? "Copying..." : "Copy"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={isCreateOpen}
        onOpenChange={(open) => {
          setIsCreateOpen(open);
          if (!open) {
            resetForm();
          }
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Quiz</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateQuiz} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="quiz-title">Title</Label>
              <Input
                id="quiz-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Chapter 3 Quiz"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quiz-description">Description (optional)</Label>
              <Input
                id="quiz-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Assign to classes (optional)</Label>
              {classes.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No classes yet — you can assign this quiz later.
                </p>
              ) : (
                <div className="grid gap-2">
                  {classes.map((classOption) => (
                    <label
                      key={classOption.id}
                      className="flex items-center gap-3 rounded-md border p-3 text-sm"
                    >
                      <Checkbox
                        checked={classIds.includes(classOption.id)}
                        onCheckedChange={() =>
                          handleToggleCreateClass(classOption.id)
                        }
                      />
                      <span className="flex-1">{classOption.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <QuizQuestionEditor
              questions={createDraft.questions}
              onQuestionChange={createDraft.handleQuestionChange}
              onOptionChange={createDraft.handleOptionChange}
              onSetCorrectOption={createDraft.handleSetCorrectOption}
              onAddOption={createDraft.handleAddOption}
              onRemoveOption={createDraft.handleRemoveOption}
              onAddQuestion={createDraft.handleAddQuestion}
              onRemoveQuestion={createDraft.handleRemoveQuestion}
            />

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "Creating..." : "Create Quiz"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={manageQuizId !== null}
        onOpenChange={(open) => !open && setManageQuizId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Manage classes — {managedQuiz?.title}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2">
            {classes.map((classOption) => {
              const isAssigned =
                managedQuiz?.assignedClasses.some(
                  (c) => c.id === classOption.id,
                ) ?? false;
              return (
                <label
                  key={classOption.id}
                  className="flex items-center gap-3 rounded-md border p-3 text-sm"
                >
                  <Checkbox
                    checked={isAssigned}
                    disabled={isTogglingAssignment}
                    onCheckedChange={() =>
                      handleToggleAssignment(classOption.id, isAssigned)
                    }
                  />
                  <span className="flex-1">{classOption.name}</span>
                </label>
              );
            })}
          </div>
          <DialogFooter showCloseButton />
        </DialogContent>
      </Dialog>

      <Dialog
        open={editQuizId !== null}
        onOpenChange={(open) => !open && closeEditDialog()}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit quiz</DialogTitle>
          </DialogHeader>
          {isLoadingEdit ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="edit-quiz-title">Title</Label>
                <Input
                  id="edit-quiz-title"
                  value={editTitle}
                  onChange={(event) => setEditTitle(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-quiz-description">Description</Label>
                <Input
                  id="edit-quiz-description"
                  value={editDescription}
                  onChange={(event) => setEditDescription(event.target.value)}
                />
              </div>

              {editLocked && (
                <p className="text-xs text-muted-foreground">
                  This quiz already has student submissions, so its questions
                  are locked. Use Copy to create an editable version.
                </p>
              )}

              <QuizQuestionEditor
                questions={editDraft.questions}
                onQuestionChange={editDraft.handleQuestionChange}
                onOptionChange={editDraft.handleOptionChange}
                onSetCorrectOption={editDraft.handleSetCorrectOption}
                onAddOption={editDraft.handleAddOption}
                onRemoveOption={editDraft.handleRemoveOption}
                onAddQuestion={editDraft.handleAddQuestion}
                onRemoveQuestion={editDraft.handleRemoveQuestion}
                readOnly={editLocked}
              />

              <div className="flex gap-2">
                {editLocked && editQuizId && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={duplicatingQuizId === editQuizId}
                    onClick={() => handleDuplicate(editQuizId)}
                  >
                    <CopyIcon className="mr-1 h-3.5 w-3.5" />
                    {duplicatingQuizId === editQuizId ? "Copying..." : "Copy to edit"}
                  </Button>
                )}
                <Button
                  type="button"
                  onClick={handleSaveEdit}
                  disabled={isSavingEdit}
                  className="flex-1"
                >
                  {isSavingEdit ? "Saving..." : "Save changes"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

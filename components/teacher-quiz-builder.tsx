"use client";

import * as React from "react";
import { toast } from "sonner";
import { PlusIcon, XIcon } from "lucide-react";

import {
  createQuizAction,
  getQuizResultsAction,
  getStudentQuizAttemptAction,
} from "@/app/protected/teacher/quiz-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QuizReviewAnswers } from "@/components/quiz-review-answers";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type {
  QuizAttemptReview,
  QuizQuestionType,
  QuizResults,
  TeacherQuizListItem,
} from "@/lib/types/database";

type ClassOption = { id: string; name: string };

type OptionDraft = { optionText: string; isCorrect: boolean };

type QuestionDraft = {
  questionText: string;
  questionType: QuizQuestionType;
  points: string;
  options: OptionDraft[];
  trueFalseAnswer: "true" | "false";
};

const QUESTION_TYPE_LABELS: Record<QuizQuestionType, string> = {
  multiple_choice: "Multiple choice",
  true_false: "True / False",
  short_answer: "Short answer",
};

function createBlankQuestion(): QuestionDraft {
  return {
    questionText: "",
    questionType: "multiple_choice",
    points: "1",
    options: [
      { optionText: "", isCorrect: true },
      { optionText: "", isCorrect: false },
    ],
    trueFalseAnswer: "true",
  };
}

export function TeacherQuizBuilder({
  classes,
  initialQuizzes,
}: {
  classes: ClassOption[];
  initialQuizzes: TeacherQuizListItem[];
}) {
  const [quizzes, setQuizzes] =
    React.useState<TeacherQuizListItem[]>(initialQuizzes);
  const [classId, setClassId] = React.useState(classes[0]?.id ?? "");
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [questions, setQuestions] = React.useState<QuestionDraft[]>([
    createBlankQuestion(),
  ]);
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

  const handleQuestionChange = (
    index: number,
    patch: Partial<QuestionDraft>,
  ) => {
    setQuestions((prev) =>
      prev.map((question, i) =>
        i === index ? { ...question, ...patch } : question,
      ),
    );
  };

  const handleOptionChange = (
    questionIndex: number,
    optionIndex: number,
    patch: Partial<OptionDraft>,
  ) => {
    setQuestions((prev) =>
      prev.map((question, i) => {
        if (i !== questionIndex) return question;
        return {
          ...question,
          options: question.options.map((option, oi) =>
            oi === optionIndex ? { ...option, ...patch } : option,
          ),
        };
      }),
    );
  };

  const handleSetCorrectOption = (
    questionIndex: number,
    optionIndex: number,
  ) => {
    setQuestions((prev) =>
      prev.map((question, i) => {
        if (i !== questionIndex) return question;
        return {
          ...question,
          options: question.options.map((option, oi) => ({
            ...option,
            isCorrect: oi === optionIndex,
          })),
        };
      }),
    );
  };

  const handleAddOption = (questionIndex: number) => {
    setQuestions((prev) =>
      prev.map((question, i) =>
        i === questionIndex
          ? {
              ...question,
              options: [
                ...question.options,
                { optionText: "", isCorrect: false },
              ],
            }
          : question,
      ),
    );
  };

  const handleRemoveOption = (questionIndex: number, optionIndex: number) => {
    setQuestions((prev) =>
      prev.map((question, i) => {
        if (i !== questionIndex) return question;
        const options = question.options.filter((_, oi) => oi !== optionIndex);
        if (options.length > 0 && !options.some((option) => option.isCorrect)) {
          options[0] = { ...options[0], isCorrect: true };
        }
        return { ...question, options };
      }),
    );
  };

  const handleAddQuestion = () => {
    setQuestions((prev) => [...prev, createBlankQuestion()]);
  };

  const handleRemoveQuestion = (index: number) => {
    setQuestions((prev) => prev.filter((_, i) => i !== index));
  };

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setQuestions([createBlankQuestion()]);
  };

  const handleCreateQuiz = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!classId) {
      toast.error("Select a class for this quiz");
      return;
    }
    if (!title.trim()) {
      toast.error("Give the quiz a title");
      return;
    }
    if (questions.length === 0) {
      toast.error("Add at least one question");
      return;
    }

    for (const [index, question] of questions.entries()) {
      if (!question.questionText.trim()) {
        toast.error(`Question ${index + 1} needs text`);
        return;
      }
      if (question.questionType === "multiple_choice") {
        const filled = question.options.filter((option) =>
          option.optionText.trim(),
        );
        if (filled.length < 2) {
          toast.error(`Question ${index + 1} needs at least 2 options`);
          return;
        }
        if (
          !question.options.some(
            (option) => option.isCorrect && option.optionText.trim(),
          )
        ) {
          toast.error(`Question ${index + 1} needs a correct answer selected`);
          return;
        }
      }
    }

    setIsSubmitting(true);
    try {
      const created = await createQuizAction({
        classId,
        title: title.trim(),
        description: description.trim() || undefined,
        questions: questions.map((question) => {
          const points = Number.parseInt(question.points, 10) || 1;

          if (question.questionType === "true_false") {
            return {
              questionText: question.questionText.trim(),
              questionType: "true_false" as const,
              points,
              options: [
                {
                  optionText: "True",
                  isCorrect: question.trueFalseAnswer === "true",
                },
                {
                  optionText: "False",
                  isCorrect: question.trueFalseAnswer === "false",
                },
              ],
            };
          }

          if (question.questionType === "short_answer") {
            return {
              questionText: question.questionText.trim(),
              questionType: "short_answer" as const,
              points,
              options: [],
            };
          }

          return {
            questionText: question.questionText.trim(),
            questionType: "multiple_choice" as const,
            points,
            options: question.options
              .filter((option) => option.optionText.trim())
              .map((option) => ({
                optionText: option.optionText.trim(),
                isCorrect: option.isCorrect,
              })),
          };
        }),
      });

      setQuizzes((prev) => [created, ...prev]);
      resetForm();
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
                No students assigned to this class yet.
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
    <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Create Quiz</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreateQuiz} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="quiz-class">Class</Label>
              <select
                id="quiz-class"
                value={classId}
                onChange={(event) => setClassId(event.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Select class</option>
                {classes.map((classOption) => (
                  <option key={classOption.id} value={classOption.id}>
                    {classOption.name}
                  </option>
                ))}
              </select>
            </div>
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

            <div className="space-y-4">
              {questions.map((question, index) => (
                <div key={index} className="space-y-3 rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold">
                      Question {index + 1}
                    </p>
                    {questions.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => handleRemoveQuestion(index)}
                        aria-label={`Remove question ${index + 1}`}
                      >
                        <XIcon className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                  <Input
                    value={question.questionText}
                    onChange={(event) =>
                      handleQuestionChange(index, {
                        questionText: event.target.value,
                      })
                    }
                    placeholder="Question text"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      aria-label="Question type"
                      value={question.questionType}
                      onChange={(event) => {
                        const nextType = event.target
                          .value as QuizQuestionType;
                        handleQuestionChange(index, {
                          questionType: nextType,
                          options:
                            nextType === "multiple_choice"
                              ? [
                                  { optionText: "", isCorrect: true },
                                  { optionText: "", isCorrect: false },
                                ]
                              : question.options,
                        });
                      }}
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    >
                      {Object.entries(QUESTION_TYPE_LABELS).map(
                        ([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ),
                      )}
                    </select>
                    <Input
                      type="number"
                      min={1}
                      value={question.points}
                      onChange={(event) =>
                        handleQuestionChange(index, {
                          points: event.target.value,
                        })
                      }
                      placeholder="Points"
                    />
                  </div>

                  {question.questionType === "multiple_choice" && (
                    <RadioGroup
                      value={question.options
                        .findIndex((option) => option.isCorrect)
                        .toString()}
                      onValueChange={(value) =>
                        handleSetCorrectOption(index, Number.parseInt(value, 10))
                      }
                    >
                      {question.options.map((option, optionIndex) => (
                        <div
                          key={optionIndex}
                          className="flex items-center gap-2"
                        >
                          <RadioGroupItem
                            value={optionIndex.toString()}
                            id={`q${index}-opt${optionIndex}`}
                            aria-label={`Mark option ${optionIndex + 1} correct`}
                          />
                          <Input
                            value={option.optionText}
                            onChange={(event) =>
                              handleOptionChange(index, optionIndex, {
                                optionText: event.target.value,
                              })
                            }
                            placeholder={`Option ${optionIndex + 1}`}
                          />
                          {question.options.length > 2 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() =>
                                handleRemoveOption(index, optionIndex)
                              }
                              aria-label={`Remove option ${optionIndex + 1}`}
                            >
                              <XIcon className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      ))}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleAddOption(index)}
                      >
                        <PlusIcon className="mr-1 h-3.5 w-3.5" /> Add option
                      </Button>
                    </RadioGroup>
                  )}

                  {question.questionType === "true_false" && (
                    <RadioGroup
                      value={question.trueFalseAnswer}
                      onValueChange={(value) =>
                        handleQuestionChange(index, {
                          trueFalseAnswer: value as "true" | "false",
                        })
                      }
                      className="flex items-center gap-4"
                    >
                      <div className="flex items-center gap-2">
                        <RadioGroupItem
                          value="true"
                          id={`tf-true-${index}`}
                        />
                        <Label
                          htmlFor={`tf-true-${index}`}
                          className="text-sm font-normal"
                        >
                          True
                        </Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <RadioGroupItem
                          value="false"
                          id={`tf-false-${index}`}
                        />
                        <Label
                          htmlFor={`tf-false-${index}`}
                          className="text-sm font-normal"
                        >
                          False
                        </Label>
                      </div>
                    </RadioGroup>
                  )}

                  {question.questionType === "short_answer" && (
                    <p className="text-xs text-muted-foreground">
                      Students will type a free-text answer. Grading it is
                      not part of this version yet.
                    </p>
                  )}
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                onClick={handleAddQuestion}
                className="w-full"
              >
                <PlusIcon className="mr-1 h-4 w-4" /> Add question
              </Button>
            </div>

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "Creating..." : "Create Quiz"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your Quizzes</CardTitle>
        </CardHeader>
        <CardContent>
          {quizzes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No quizzes created yet.
            </p>
          ) : (
            <div className="space-y-2">
              {quizzes.map((quiz) => (
                <button
                  key={quiz.id}
                  type="button"
                  onClick={() => handleSelectQuiz(quiz.id)}
                  className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-left hover:bg-muted/50"
                >
                  <div>
                    <p className="text-sm font-medium">{quiz.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {quiz.className}
                    </p>
                  </div>
                  <Badge variant="outline">
                    {quiz.questionCount} questions
                  </Badge>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

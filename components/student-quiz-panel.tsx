"use client";

import * as React from "react";
import { toast } from "sonner";

import {
  getQuizForTakingAction,
  getQuizReviewAction,
  submitQuizAttemptAction,
} from "@/app/student-dashboard/quiz-actions";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type {
  QuizAnswerInput,
  QuizAttemptReview,
  QuizForTaking,
  QuizSummary,
} from "@/lib/types/database";

type ViewState =
  | { mode: "list" }
  | { mode: "taking"; quiz: QuizForTaking }
  | { mode: "review"; review: QuizAttemptReview };

export function StudentQuizPanel({
  quizzes: initialQuizzes,
}: {
  quizzes: QuizSummary[];
}) {
  const [quizzes, setQuizzes] = React.useState(initialQuizzes);
  const [view, setView] = React.useState<ViewState>({ mode: "list" });
  const [isLoading, setIsLoading] = React.useState(false);
  const [answers, setAnswers] = React.useState<
    Record<string, QuizAnswerInput>
  >({});
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const handleTakeQuiz = async (quizId: string) => {
    setIsLoading(true);
    try {
      const quiz = await getQuizForTakingAction(quizId);
      setAnswers({});
      setView({ mode: "taking", quiz });
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : "Failed to load quiz",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleViewReview = async (quizId: string) => {
    setIsLoading(true);
    try {
      const review = await getQuizReviewAction(quizId);
      setView({ mode: "review", review });
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : "Failed to load review",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleAnswerChange = (
    questionId: string,
    patch: Partial<QuizAnswerInput>,
  ) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: { ...prev[questionId], ...patch, questionId },
    }));
  };

  const handleSubmitQuiz = async () => {
    if (view.mode !== "taking") {
      return;
    }

    const unanswered = view.quiz.questions.filter((question) => {
      const answer = answers[question.id];
      return !answer || (!answer.selectedOptionId && !answer.textAnswer?.trim());
    });

    if (unanswered.length > 0) {
      toast.error(`Please answer all questions (${unanswered.length} left)`);
      return;
    }

    setIsSubmitting(true);
    try {
      const review = await submitQuizAttemptAction(
        view.quiz.id,
        Object.values(answers),
      );
      setQuizzes((prev) =>
        prev.map((quiz) =>
          quiz.id === review.quizId
            ? {
                ...quiz,
                completed: true,
                score: review.score,
                maxScore: review.maxScore,
                submittedAt: review.submittedAt,
              }
            : quiz,
        ),
      );
      setView({ mode: "review", review });
      toast.success("Quiz submitted");
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : "Failed to submit quiz",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (view.mode === "taking") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{view.quiz.title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {view.quiz.questions.map((question, index) => (
            <div
              key={question.id}
              className="space-y-3 rounded-lg border p-3"
            >
              <p className="text-sm font-medium">
                {index + 1}. {question.questionText}
              </p>
              {question.questionType === "short_answer" ? (
                <Input
                  value={answers[question.id]?.textAnswer ?? ""}
                  onChange={(event) =>
                    handleAnswerChange(question.id, {
                      textAnswer: event.target.value,
                    })
                  }
                  placeholder="Your answer"
                />
              ) : (
                <RadioGroup
                  value={answers[question.id]?.selectedOptionId ?? ""}
                  onValueChange={(value) =>
                    handleAnswerChange(question.id, {
                      selectedOptionId: value,
                    })
                  }
                >
                  {question.options.map((option) => (
                    <div key={option.id} className="flex items-center gap-2">
                      <RadioGroupItem
                        value={option.id}
                        id={`answer-${option.id}`}
                      />
                      <Label
                        htmlFor={`answer-${option.id}`}
                        className="text-sm font-normal"
                      >
                        {option.optionText}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              )}
            </div>
          ))}
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setView({ mode: "list" })}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmitQuiz}
              disabled={isSubmitting}
              className="flex-1"
            >
              {isSubmitting ? "Submitting..." : "Submit Quiz"}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (view.mode === "review") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{view.review.quizTitle} — Review</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-2xl font-bold">
            {view.review.score} / {view.review.maxScore}
          </p>
          <div className="space-y-3">
            {view.review.answers.map((answer, index) => (
              <div
                key={answer.questionId}
                className={
                  "rounded-lg border p-3 " +
                  (answer.isCorrect === true
                    ? "border-green-200 bg-green-50 text-green-950 dark:border-green-900 dark:bg-green-950 dark:text-green-50"
                    : answer.isCorrect === false
                      ? "border-red-200 bg-red-50 text-red-950 dark:border-red-900 dark:bg-red-950 dark:text-red-50"
                      : "")
                }
              >
                <p className="text-sm font-medium">
                  {index + 1}. {answer.questionText}
                </p>
                {answer.questionType === "short_answer" ? (
                  <div className="mt-2 space-y-1 text-sm">
                    <p>Your answer: {answer.textAnswer || "(no answer)"}</p>
                    <Badge variant="outline">Awaiting review</Badge>
                  </div>
                ) : (
                  <div className="mt-2 text-sm">
                    <Badge variant={answer.isCorrect ? "default" : "destructive"}>
                      {answer.isCorrect ? "Correct" : "Incorrect"}
                    </Badge>
                  </div>
                )}
              </div>
            ))}
          </div>
          <Button variant="outline" onClick={() => setView({ mode: "list" })}>
            Back to quizzes
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Quizzes</CardTitle>
      </CardHeader>
      <CardContent>
        {quizzes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No quizzes assigned yet.
          </p>
        ) : (
          <div className="space-y-2">
            {quizzes.map((quiz) => (
              <div
                key={quiz.id}
                className="flex items-center justify-between rounded-md border px-3 py-2"
              >
                <div>
                  <p className="text-sm font-medium">{quiz.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {quiz.className}
                  </p>
                </div>
                {quiz.completed ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isLoading}
                    onClick={() => handleViewReview(quiz.id)}
                  >
                    {quiz.score} / {quiz.maxScore} · Review
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    disabled={isLoading}
                    onClick={() => handleTakeQuiz(quiz.id)}
                  >
                    Take Quiz
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

"use client";

import * as React from "react";
import { format } from "date-fns";
import { el } from "date-fns/locale";
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
import { MathText } from "@/components/math-text";
import { PortalHistoryDialog } from "@/components/portal-history-dialog";
import { QuizQuestionImage } from "@/components/quiz-question-image";
import { QuizReviewAnswers } from "@/components/quiz-review-answers";
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

const RECENT_PREVIEW_COUNT = 5;

function formatRemainingTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

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
  const [remainingSeconds, setRemainingSeconds] = React.useState<
    number | null
  >(null);

  const handleTakeQuiz = async (quizId: string) => {
    setIsLoading(true);
    try {
      const quiz = await getQuizForTakingAction(quizId);
      setAnswers({});
      setView({ mode: "taking", quiz });
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : "Αποτυχία φόρτωσης τεστ",
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
        error instanceof Error
          ? error.message
          : "Αποτυχία φόρτωσης ανασκόπησης",
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

  const handleSubmitQuiz = async (options?: { auto?: boolean }) => {
    if (view.mode !== "taking") {
      return;
    }

    const auto = options?.auto ?? false;

    if (!auto) {
      const unanswered = view.quiz.questions.filter((question) => {
        const answer = answers[question.id];
        return (
          !answer || (!answer.selectedOptionId && !answer.textAnswer?.trim())
        );
      });

      if (unanswered.length > 0) {
        toast.error(
          `Παρακαλώ απαντήστε σε όλες τις ερωτήσεις (απομένουν ${unanswered.length})`,
        );
        return;
      }
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
                bestScore: review.best?.score ?? review.score,
                attemptsUsed: review.attemptsUsed,
                maxAttempts: review.maxAttempts,
                canRetake: review.canRetake,
              }
            : quiz,
        ),
      );
      setView({ mode: "review", review });
      toast.success(
        auto
          ? "Ο χρόνος τελείωσε — το τεστ υποβλήθηκε αυτόματα"
          : "Το τεστ υποβλήθηκε",
      );
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : "Αποτυχία υποβολής τεστ",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // Keeps a ref to the latest handleSubmitQuiz closure (fresh `answers`
  // included) so the countdown effect below can trigger an auto-submit
  // without needing to restart the interval every time an answer changes.
  const handleSubmitQuizRef = React.useRef(handleSubmitQuiz);
  React.useEffect(() => {
    handleSubmitQuizRef.current = handleSubmitQuiz;
  });

  React.useEffect(() => {
    if (
      view.mode !== "taking" ||
      view.quiz.timeLimitMinutes === null ||
      !view.quiz.startedAt
    ) {
      // Resets the countdown when leaving a timed quiz or entering an
      // untimed one - there's no external subscription to unsubscribe from
      // here, just a derived value that needs to stop showing stale time.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRemainingSeconds(null);
      return;
    }

    const deadline =
      Date.parse(view.quiz.startedAt) + view.quiz.timeLimitMinutes * 60_000;
    let hasAutoSubmitted = false;

    const tick = () => {
      const secondsLeft = Math.max(
        0,
        Math.round((deadline - Date.now()) / 1000),
      );
      setRemainingSeconds(secondsLeft);
      if (secondsLeft <= 0 && !hasAutoSubmitted) {
        hasAutoSubmitted = true;
        handleSubmitQuizRef.current({ auto: true });
      }
    };

    tick();
    const intervalId = setInterval(tick, 1000);
    return () => clearInterval(intervalId);
  }, [view]);

  if (view.mode === "taking") {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle>
            <MathText text={view.quiz.title} />
          </CardTitle>
          {remainingSeconds !== null && (
            <Badge variant={remainingSeconds <= 60 ? "destructive" : "outline"}>
              {formatRemainingTime(remainingSeconds)}
            </Badge>
          )}
        </CardHeader>
        <CardContent className="space-y-6">
          {view.quiz.questions.map((question, index) => (
            <div
              key={question.id}
              className="space-y-3 rounded-lg border p-3"
            >
              <p className="text-sm font-medium">
                {index + 1}. <MathText text={question.questionText} />
              </p>
              {question.imageUrl && (
                <QuizQuestionImage imageUrl={question.imageUrl} />
              )}
              {question.questionType === "short_answer" ? (
                <Input
                  value={answers[question.id]?.textAnswer ?? ""}
                  onChange={(event) =>
                    handleAnswerChange(question.id, {
                      textAnswer: event.target.value,
                    })
                  }
                  placeholder="Η απάντησή σας"
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
                        <MathText text={option.optionText} />
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
              Ακύρωση
            </Button>
            <Button
              onClick={() => handleSubmitQuiz()}
              disabled={isSubmitting}
              className="flex-1"
            >
              {isSubmitting ? "Γίνεται υποβολή..." : "Υποβολή τεστ"}
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
          <CardTitle>
            <MathText text={view.review.quizTitle} /> — Ανασκόπηση
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="text-base font-bold">
              Επίσημος: {view.review.score} / {view.review.maxScore}
            </Badge>
            {view.review.best && (
              <Badge className="text-base font-bold">
                Καλύτερος: {view.review.best.score} / {view.review.maxScore}
              </Badge>
            )}
          </div>
          {view.review.attemptsUsed > 1 && (
            <p className="text-sm text-muted-foreground">
              {view.review.attemptsUsed} προσπάθειες
            </p>
          )}
          <div>
            <p className="mb-2 text-sm font-medium">Πρώτη προσπάθεια</p>
            <QuizReviewAnswers answers={view.review.answers} locale="el" />
          </div>
          {view.review.best && (
            <div>
              <p className="mb-2 text-sm font-medium">
                Καλύτερη προσπάθεια
              </p>
              <QuizReviewAnswers
                answers={view.review.best.answers}
                locale="el"
              />
            </div>
          )}
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setView({ mode: "list" })}
            >
              Πίσω στα τεστ
            </Button>
            {view.review.canRetake && (
              <Button
                disabled={isLoading}
                onClick={() => handleTakeQuiz(view.review.quizId)}
              >
                Επανάληψη τεστ
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  const renderQuizRow = (quiz: QuizSummary) => (
    <div
      key={quiz.id}
      className="flex items-center justify-between rounded-md border px-3 py-2"
    >
      <div>
        <p className="text-sm font-medium">
          <MathText text={quiz.title} />
        </p>
        <p className="text-xs text-muted-foreground">
          {quiz.className ||
            (quiz.submittedAt
              ? format(new Date(quiz.submittedAt), "d MMMM yyyy", {
                  locale: el,
                })
              : "")}
        </p>
      </div>
      {quiz.quizDeleted ? (
        <Badge variant="outline">
          {quiz.score} / {quiz.maxScore}
        </Badge>
      ) : quiz.completed ? (
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">
            Επίσημος: {quiz.score} / {quiz.maxScore}
          </Badge>
          {quiz.attemptsUsed > 1 && (
            <Badge>Καλύτερος: {quiz.bestScore} / {quiz.maxScore}</Badge>
          )}
          <Button
            variant="outline"
            size="sm"
            disabled={isLoading}
            onClick={() => handleViewReview(quiz.id)}
          >
            Ανασκόπηση
          </Button>
          {quiz.canRetake && (
            <Button
              size="sm"
              disabled={isLoading}
              onClick={() => handleTakeQuiz(quiz.id)}
            >
              Επανάληψη
            </Button>
          )}
        </div>
      ) : (
        <Button
          size="sm"
          disabled={isLoading}
          onClick={() => handleTakeQuiz(quiz.id)}
        >
          Έναρξη τεστ
        </Button>
      )}
    </div>
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle>Τεστ</CardTitle>
        {quizzes.length > RECENT_PREVIEW_COUNT ? (
          <PortalHistoryDialog triggerLabel="Ιστορικό" title="Τεστ">
            {quizzes.map(renderQuizRow)}
          </PortalHistoryDialog>
        ) : null}
      </CardHeader>
      <CardContent>
        {quizzes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Δεν έχουν ανατεθεί τεστ ακόμα.
          </p>
        ) : (
          <div className="space-y-2">
            {quizzes.slice(0, RECENT_PREVIEW_COUNT).map(renderQuizRow)}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

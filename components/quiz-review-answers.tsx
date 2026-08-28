import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EDITABLE_COMMENT_LABELS, EditableComment } from "@/components/editable-comment";
import { MathText } from "@/components/math-text";
import { QuizQuestionImage } from "@/components/quiz-question-image";
import type { QuizAttemptAnswerReview } from "@/lib/types/database";

const LABELS = {
  en: {
    answer: "Answer:",
    noAnswer: "(no answer)",
    awaitingReview: "Awaiting review",
    selected: "Selected:",
    correctAnswer: "Correct answer:",
    correct: "Correct",
    incorrect: "Incorrect",
    markCorrect: "Mark correct",
    markIncorrect: "Mark incorrect",
  },
  el: {
    answer: "Απάντηση:",
    noAnswer: "(χωρίς απάντηση)",
    awaitingReview: "Εκκρεμεί βαθμολόγηση",
    selected: "Επιλογή:",
    correctAnswer: "Σωστή απάντηση:",
    correct: "Σωστό",
    incorrect: "Λάθος",
    markCorrect: "Σήμανση ως σωστό",
    markIncorrect: "Σήμανση ως λάθος",
  },
};

/**
 * Renders a list of graded quiz answers - shared between the student's own
 * review and the teacher's view of a specific student's answers, so the
 * strings are locale-switched rather than hardcoded to either side.
 * Comment editing only renders when a teacher-side caller passes
 * onSaveComment - the student/parent side never does, so they only ever
 * see the comment as read-only text.
 */
export function QuizReviewAnswers({
  answers,
  locale = "en",
  onSaveComment,
  onGrade,
  gradingAnswerId,
}: {
  answers: QuizAttemptAnswerReview[];
  locale?: "en" | "el";
  onSaveComment?: (
    answer: QuizAttemptAnswerReview,
    comment: string | null,
  ) => Promise<void> | void;
  // Renders Mark correct/incorrect buttons for a short-answer response
  // still awaiting review. The student/parent side never passes this.
  onGrade?: (
    answer: QuizAttemptAnswerReview,
    isCorrect: boolean,
  ) => Promise<void> | void;
  gradingAnswerId?: string | null;
}) {
  const labels = LABELS[locale];
  const commentLabels = EDITABLE_COMMENT_LABELS[locale];

  return (
    <div className="space-y-3">
      {answers.map((answer, index) => (
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
            {index + 1}. <MathText text={answer.questionText} />
          </p>
          {answer.imageUrl && (
            <div className="mt-2">
              <QuizQuestionImage imageUrl={answer.imageUrl} />
            </div>
          )}
          {answer.questionType === "short_answer" ? (
            <div className="mt-2 space-y-1 text-sm">
              <p>
                {labels.answer} {answer.textAnswer || labels.noAnswer}
              </p>
              {answer.isCorrect === null ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{labels.awaitingReview}</Badge>
                  {onGrade && (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        disabled={gradingAnswerId === answer.answerId}
                        onClick={() => onGrade(answer, true)}
                      >
                        {labels.markCorrect}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={gradingAnswerId === answer.answerId}
                        onClick={() => onGrade(answer, false)}
                      >
                        {labels.markIncorrect}
                      </Button>
                    </>
                  )}
                </div>
              ) : (
                <Badge variant={answer.isCorrect ? "default" : "destructive"}>
                  {answer.isCorrect ? labels.correct : labels.incorrect}
                </Badge>
              )}
            </div>
          ) : (
            <div className="mt-2 space-y-1 text-sm">
              <p>
                {labels.selected}{" "}
                {answer.selectedOptionText ? (
                  <MathText text={answer.selectedOptionText} />
                ) : (
                  labels.noAnswer
                )}
              </p>
              {!answer.isCorrect && answer.correctOptionText && (
                <p>
                  {labels.correctAnswer}{" "}
                  <MathText text={answer.correctOptionText} />
                </p>
              )}
              <Badge variant={answer.isCorrect ? "default" : "destructive"}>
                {answer.isCorrect ? labels.correct : labels.incorrect}
              </Badge>
            </div>
          )}
          <EditableComment
            comment={answer.teacherComment}
            labels={commentLabels}
            onSave={
              onSaveComment
                ? (comment) => onSaveComment(answer, comment)
                : undefined
            }
          />
        </div>
      ))}
    </div>
  );
}

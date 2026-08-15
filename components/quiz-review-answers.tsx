import { Badge } from "@/components/ui/badge";
import { MathText } from "@/components/math-text";
import type { QuizAttemptAnswerReview } from "@/lib/types/database";

/**
 * Renders a list of graded quiz answers - shared between the student's own
 * review and the teacher's view of a specific student's answers.
 */
export function QuizReviewAnswers({
  answers,
}: {
  answers: QuizAttemptAnswerReview[];
}) {
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
          {answer.questionType === "short_answer" ? (
            <div className="mt-2 space-y-1 text-sm">
              <p>Answer: {answer.textAnswer || "(no answer)"}</p>
              <Badge variant="outline">Awaiting review</Badge>
            </div>
          ) : (
            <div className="mt-2 space-y-1 text-sm">
              <p>
                Selected:{" "}
                {answer.selectedOptionText ? (
                  <MathText text={answer.selectedOptionText} />
                ) : (
                  "(no answer)"
                )}
              </p>
              {!answer.isCorrect && answer.correctOptionText && (
                <p>
                  Correct answer: <MathText text={answer.correctOptionText} />
                </p>
              )}
              <Badge variant={answer.isCorrect ? "default" : "destructive"}>
                {answer.isCorrect ? "Correct" : "Incorrect"}
              </Badge>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

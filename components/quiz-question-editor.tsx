"use client";

import * as React from "react";
import { PlusIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { QuizQuestionInput, QuizQuestionType } from "@/lib/types/database";

export type OptionDraft = { optionText: string; isCorrect: boolean };

export type QuestionDraft = {
  questionText: string;
  questionType: QuizQuestionType;
  points: string;
  options: OptionDraft[];
  trueFalseAnswer: "true" | "false";
};

export const QUESTION_TYPE_LABELS: Record<QuizQuestionType, string> = {
  multiple_choice: "Multiple choice",
  true_false: "True / False",
  short_answer: "Short answer",
};

export function createBlankQuestion(): QuestionDraft {
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

/** Converts editable drafts into the server's authoring input shape. */
export function draftsToQuestionInputs(
  questions: QuestionDraft[],
): QuizQuestionInput[] {
  return questions.map((question) => {
    const points = Number.parseInt(question.points, 10) || 1;

    if (question.questionType === "true_false") {
      return {
        questionText: question.questionText.trim(),
        questionType: "true_false" as const,
        points,
        options: [
          { optionText: "True", isCorrect: question.trueFalseAnswer === "true" },
          { optionText: "False", isCorrect: question.trueFalseAnswer === "false" },
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
  });
}

/** Converts the server's authoring input shape back into editable drafts. */
export function questionInputsToDrafts(
  questions: QuizQuestionInput[],
): QuestionDraft[] {
  return questions.map((question) => ({
    questionText: question.questionText,
    questionType: question.questionType,
    points: String(question.points),
    options: question.options.map((option) => ({
      optionText: option.optionText,
      isCorrect: option.isCorrect,
    })),
    trueFalseAnswer:
      question.questionType === "true_false" &&
      question.options.find((option) => option.optionText === "True")
        ?.isCorrect === false
        ? "false"
        : "true",
  }));
}

/** Returns an error message for the first invalid question, or null. */
export function validateQuestionDrafts(
  questions: QuestionDraft[],
): string | null {
  if (questions.length === 0) {
    return "Add at least one question";
  }

  for (const [index, question] of questions.entries()) {
    if (!question.questionText.trim()) {
      return `Question ${index + 1} needs text`;
    }
    if (question.questionType === "multiple_choice") {
      const filled = question.options.filter((option) =>
        option.optionText.trim(),
      );
      if (filled.length < 2) {
        return `Question ${index + 1} needs at least 2 options`;
      }
      if (
        !question.options.some(
          (option) => option.isCorrect && option.optionText.trim(),
        )
      ) {
        return `Question ${index + 1} needs a correct answer selected`;
      }
    }
  }

  return null;
}

export function useQuestionDrafts(initial?: QuestionDraft[]) {
  const [questions, setQuestions] = React.useState<QuestionDraft[]>(
    initial ?? [createBlankQuestion()],
  );

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

  return {
    questions,
    setQuestions,
    handleQuestionChange,
    handleOptionChange,
    handleSetCorrectOption,
    handleAddOption,
    handleRemoveOption,
    handleAddQuestion,
    handleRemoveQuestion,
  };
}

export function QuizQuestionEditor({
  questions,
  onQuestionChange,
  onOptionChange,
  onSetCorrectOption,
  onAddOption,
  onRemoveOption,
  onAddQuestion,
  onRemoveQuestion,
  readOnly = false,
}: {
  questions: QuestionDraft[];
  onQuestionChange: (index: number, patch: Partial<QuestionDraft>) => void;
  onOptionChange: (
    questionIndex: number,
    optionIndex: number,
    patch: Partial<OptionDraft>,
  ) => void;
  onSetCorrectOption: (questionIndex: number, optionIndex: number) => void;
  onAddOption: (questionIndex: number) => void;
  onRemoveOption: (questionIndex: number, optionIndex: number) => void;
  onAddQuestion: () => void;
  onRemoveQuestion: (index: number) => void;
  readOnly?: boolean;
}) {
  return (
    <div className="space-y-4">
      {questions.map((question, index) => (
        <div key={index} className="space-y-3 rounded-lg border p-3">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold">Question {index + 1}</p>
            {!readOnly && questions.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => onRemoveQuestion(index)}
                aria-label={`Remove question ${index + 1}`}
              >
                <XIcon className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
          <Input
            value={question.questionText}
            disabled={readOnly}
            onChange={(event) =>
              onQuestionChange(index, { questionText: event.target.value })
            }
            placeholder="Question text"
          />
          <div className="grid grid-cols-2 gap-2">
            <select
              aria-label="Question type"
              value={question.questionType}
              disabled={readOnly}
              onChange={(event) => {
                const nextType = event.target.value as QuizQuestionType;
                onQuestionChange(index, {
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
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm disabled:opacity-50"
            >
              {Object.entries(QUESTION_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <Input
              type="number"
              min={1}
              value={question.points}
              disabled={readOnly}
              onChange={(event) =>
                onQuestionChange(index, { points: event.target.value })
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
                onSetCorrectOption(index, Number.parseInt(value, 10))
              }
            >
              {question.options.map((option, optionIndex) => (
                <div key={optionIndex} className="flex items-center gap-2">
                  <RadioGroupItem
                    value={optionIndex.toString()}
                    id={`q${index}-opt${optionIndex}`}
                    disabled={readOnly}
                    aria-label={`Mark option ${optionIndex + 1} correct`}
                  />
                  <Input
                    value={option.optionText}
                    disabled={readOnly}
                    onChange={(event) =>
                      onOptionChange(index, optionIndex, {
                        optionText: event.target.value,
                      })
                    }
                    placeholder={`Option ${optionIndex + 1}`}
                  />
                  {!readOnly && question.options.length > 2 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => onRemoveOption(index, optionIndex)}
                      aria-label={`Remove option ${optionIndex + 1}`}
                    >
                      <XIcon className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))}
              {!readOnly && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onAddOption(index)}
                >
                  <PlusIcon className="mr-1 h-3.5 w-3.5" /> Add option
                </Button>
              )}
            </RadioGroup>
          )}

          {question.questionType === "true_false" && (
            <RadioGroup
              value={question.trueFalseAnswer}
              onValueChange={(value) =>
                onQuestionChange(index, {
                  trueFalseAnswer: value as "true" | "false",
                })
              }
              className="flex items-center gap-4"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem
                  value="true"
                  id={`tf-true-${index}`}
                  disabled={readOnly}
                />
                <Label htmlFor={`tf-true-${index}`} className="text-sm font-normal">
                  True
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem
                  value="false"
                  id={`tf-false-${index}`}
                  disabled={readOnly}
                />
                <Label htmlFor={`tf-false-${index}`} className="text-sm font-normal">
                  False
                </Label>
              </div>
            </RadioGroup>
          )}

          {question.questionType === "short_answer" && (
            <p className="text-xs text-muted-foreground">
              Students will type a free-text answer. Grading it is not part
              of this version yet.
            </p>
          )}
        </div>
      ))}
      {!readOnly && (
        <Button type="button" variant="outline" onClick={onAddQuestion} className="w-full">
          <PlusIcon className="mr-1 h-4 w-4" /> Add question
        </Button>
      )}
    </div>
  );
}

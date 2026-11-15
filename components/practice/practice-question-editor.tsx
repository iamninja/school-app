"use client";

import * as React from "react";
import { DicesIcon, ImageIcon, PlusIcon, Trash2Icon, XIcon } from "lucide-react";
import { toast } from "sonner";

import { savePracticeQuestionAction } from "@/app/protected/teacher/practice-actions";
import { PracticeQuestionPreview } from "@/components/practice/practice-question-preview";
import { Button } from "@/components/ui/button";
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
import { getErrorMessage } from "@/lib/expected-error";
import { PRACTICE_IMAGES_BUCKET, practiceImageUrl, type PracticeQuestion } from "@/lib/practice-bank";
import {
  instantiate,
  seededRng,
  validatePracticeQuestion,
  type PlayableQuestion,
  type PracticeQuestionSpec,
  type PracticeQuestionType,
} from "@/lib/practice-template";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export const PRACTICE_TYPE_LABELS: Record<PracticeQuestionType, string> = {
  choice: "Multiple choice",
  true_false: "True / false",
  number: "Number",
  slider: "Slider",
  point: "Graph point",
};

type Draft = {
  type: PracticeQuestionType;
  prompt: string;
  options: { text: string; correct: boolean }[];
  tfAnswer: "true" | "false";
  answer: string;
  tolerance: string;
  sliderMin: string;
  sliderMax: string;
  sliderStep: string;
  xMin: string;
  xMax: string;
  yMin: string;
  yMax: string;
  plots: string;
  variables: string;
  condition: string;
  explanation: string;
  imagePath: string | null;
};

const text = (value: number | null | undefined) => (value === null || value === undefined ? "" : String(value));

export function draftFrom(question: Partial<PracticeQuestion> | null): Draft {
  const graph = question?.graph ?? { xMin: -5, xMax: 5, yMin: -5, yMax: 5, plots: [] };
  return {
    type: question?.type ?? "choice",
    prompt: question?.prompt ?? "",
    options: question?.options?.length
      ? question.options.map((option) => ({ ...option }))
      : [
          { text: "", correct: true },
          { text: "", correct: false },
          { text: "", correct: false },
        ],
    tfAnswer: question?.type === "true_false" && question.answer === "false" ? "false" : "true",
    answer: question?.type === "true_false" ? "" : (question?.answer ?? ""),
    tolerance: text(question?.tolerance),
    sliderMin: text(question?.sliderMin ?? (question?.type === "slider" ? null : 0)),
    sliderMax: text(question?.sliderMax ?? (question?.type === "slider" ? null : 10)),
    sliderStep: text(question?.sliderStep),
    xMin: String(graph.xMin),
    xMax: String(graph.xMax),
    yMin: String(graph.yMin),
    yMax: String(graph.yMax),
    plots: graph.plots.join("\n"),
    variables: question?.variables ?? "",
    condition: question?.condition ?? "",
    explanation: question?.explanation ?? "",
    imagePath: question?.imagePath ?? null,
  };
}

const toNumber = (value: string): number | null => {
  const trimmed = value.trim().replace(",", ".").replace(/[−–]/g, "-");
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : NaN;
};

export function specFrom(draft: Draft): PracticeQuestionSpec {
  const spec: PracticeQuestionSpec = {
    type: draft.type,
    prompt: draft.prompt,
    variables: draft.variables.trim() || null,
    condition: draft.condition.trim() || null,
    explanation: draft.explanation.trim() || null,
  };
  if (draft.type === "choice") spec.options = draft.options.filter((option) => option.text.trim());
  else if (draft.type === "true_false") spec.answer = draft.tfAnswer;
  else spec.answer = draft.answer;
  if (draft.type === "number" || draft.type === "slider" || draft.type === "point") {
    spec.tolerance = toNumber(draft.tolerance);
  }
  if (draft.type === "slider") {
    spec.sliderMin = toNumber(draft.sliderMin);
    spec.sliderMax = toNumber(draft.sliderMax);
    spec.sliderStep = toNumber(draft.sliderStep);
  }
  if (draft.type === "point") {
    spec.graph = {
      xMin: toNumber(draft.xMin) ?? -5,
      xMax: toNumber(draft.xMax) ?? 5,
      yMin: toNumber(draft.yMin) ?? -5,
      yMax: toNumber(draft.yMax) ?? 5,
      plots: draft.plots.split("\n").map((plot) => plot.trim()).filter(Boolean),
    };
  }
  return spec;
}

function numberProblems(spec: PracticeQuestionSpec): string[] {
  const values = [spec.tolerance, spec.sliderMin, spec.sliderMax, spec.sliderStep];
  return values.some((value) => typeof value === "number" && Number.isNaN(value)) ? ["Tolerance, range and step take plain numbers"] : [];
}

/**
 * The question editor: create (questionId absent) or edit. "Save & next"
 * keeps the dialog open with a fresh question of the same type.
 */
export function PracticeQuestionEditor({
  open,
  sectionId,
  sectionName,
  question,
  onClose,
  onSaved,
}: {
  open: boolean;
  sectionId: string;
  sectionName: string;
  /** null: new; with an id: edit; without an id: a duplicate to save as new. */
  question: Partial<PracticeQuestion> | null;
  onClose: () => void;
  onSaved: (question: PracticeQuestion, isNew: boolean) => void;
}) {
  const [draft, setDraft] = React.useState<Draft>(() => draftFrom(question));
  const [seed, setSeed] = React.useState(1);
  const [saving, setSaving] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [showVariables, setShowVariables] = React.useState(Boolean(question?.variables));
  const [loadedFor, setLoadedFor] = React.useState<Partial<PracticeQuestion> | null>(question);

  // A different question opened: start from it (derived, not an effect).
  if (question !== loadedFor) {
    setLoadedFor(question);
    setDraft(draftFrom(question));
    setShowVariables(Boolean(question?.variables));
    setSeed(1);
  }

  const isEdit = Boolean(question?.id);
  const update = (changes: Partial<Draft>) => setDraft((current) => ({ ...current, ...changes }));
  const spec = React.useMemo(() => specFrom(draft), [draft]);
  const problems = React.useMemo(() => [...numberProblems(spec), ...validatePracticeQuestion(spec)], [spec]);
  const preview = React.useMemo((): PlayableQuestion | null => {
    if (problems.length) return null;
    try {
      return instantiate(spec, seededRng(seed));
    } catch {
      return null;
    }
  }, [spec, seed, problems]);

  const save = async (next: boolean) => {
    if (problems.length) return;
    setSaving(true);
    try {
      const saved = await savePracticeQuestionAction({
        sectionId,
        questionId: question?.id ?? null,
        spec,
        imagePath: draft.imagePath,
      });
      onSaved(saved, !isEdit);
      toast.success(isEdit ? "Saved" : "Question added");
      if (next) {
        setDraft({ ...draftFrom(null), type: draft.type, variables: "", condition: "" });
        setLoadedFor(null);
        setSeed(1);
      } else onClose();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Couldn't save the question"));
    } finally {
      setSaving(false);
    }
  };

  const uploadImage = async (file: File) => {
    if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) return toast.error("Images must be JPEG, PNG, WebP or GIF");
    if (file.size > 5 * 1024 * 1024) return toast.error("Images must be 5 MB or smaller");
    setUploading(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");
      const extension = file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1];
      const path = `${user.id}/${crypto.randomUUID()}.${extension}`;
      const { error } = await supabase.storage.from(PRACTICE_IMAGES_BUCKET).upload(path, file, { contentType: file.type });
      if (error) throw error;
      update({ imagePath: path });
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Couldn't upload the image"));
    } finally {
      setUploading(false);
    }
  };

  const hasVariables = Boolean(draft.variables.trim());

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !saving && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit question" : "New question"}</DialogTitle>
          <DialogDescription>{sectionName}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
          <div className="min-w-0 space-y-4">
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 text-sm sm:grid-cols-5" role="radiogroup" aria-label="Question type">
              {(Object.keys(PRACTICE_TYPE_LABELS) as PracticeQuestionType[]).map((type) => (
                <button
                  key={type}
                  type="button"
                  role="radio"
                  aria-checked={draft.type === type}
                  onClick={() => update({ type })}
                  className={cn(
                    "rounded-md px-2 py-1.5 font-medium transition",
                    draft.type === type ? "bg-background shadow-xs" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {PRACTICE_TYPE_LABELS[type]}
                </button>
              ))}
            </div>

            <div className="space-y-2">
              <Label htmlFor="pq-prompt">Question</Label>
              <Textarea
                id="pq-prompt"
                rows={3}
                value={draft.prompt}
                onChange={(event) => update({ prompt: event.target.value })}
                placeholder="Λύσε την εξίσωση $2x + 7 = 19$."
              />
              <p className="text-xs text-muted-foreground">
                Math in <code>$…$</code>. With random numbers, <code>{"{{a}}"}</code> puts in a value and <code>{"{{+b}}"}</code> a signed one.
              </p>
            </div>

            {draft.type === "choice" ? (
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Options · pick the correct one</legend>
                {draft.options.map((option, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="pq-correct"
                      id={`pq-correct-${index}`}
                      className="size-4 accent-emerald-600"
                      checked={option.correct}
                      onChange={() => update({ options: draft.options.map((item, i) => ({ ...item, correct: i === index })) })}
                      aria-label={`Option ${index + 1} is correct`}
                    />
                    <Input
                      id={`pq-option-${index}`}
                      value={option.text}
                      onChange={(event) =>
                        update({ options: draft.options.map((item, i) => (i === index ? { ...item, text: event.target.value } : item)) })
                      }
                      placeholder={option.correct ? "Correct answer" : "A typical mistake"}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="size-8 shrink-0 p-0"
                      disabled={draft.options.length <= 2}
                      onClick={() => {
                        const options = draft.options.filter((_, i) => i !== index);
                        if (!options.some((item) => item.correct)) options[0] = { ...options[0], correct: true };
                        update({ options });
                      }}
                      aria-label={`Remove option ${index + 1}`}
                    >
                      <XIcon className="size-4" />
                    </Button>
                  </div>
                ))}
                {draft.options.length < 6 ? (
                  <Button type="button" variant="outline" size="sm" onClick={() => update({ options: [...draft.options, { text: "", correct: false }] })}>
                    <PlusIcon className="size-3.5" /> Add option
                  </Button>
                ) : null}
              </fieldset>
            ) : null}

            {draft.type === "true_false" ? (
              <fieldset className="flex gap-4 text-sm">
                <legend className="mb-2 text-sm font-medium">Answer</legend>
                {(["true", "false"] as const).map((value) => (
                  <label key={value} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="pq-tf"
                      className="size-4 accent-emerald-600"
                      checked={draft.tfAnswer === value}
                      onChange={() => update({ tfAnswer: value })}
                    />
                    {value === "true" ? "True (Σωστό)" : "False (Λάθος)"}
                  </label>
                ))}
              </fieldset>
            ) : null}

            {draft.type === "number" || draft.type === "slider" || draft.type === "point" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="pq-answer">Answer</Label>
                  <Input
                    id="pq-answer"
                    value={draft.answer}
                    onChange={(event) => update({ answer: event.target.value })}
                    placeholder={draft.type === "point" ? "(2, 1)" : hasVariables ? "x  or  a*x + b" : "6"}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pq-tolerance">
                    Counts as right within ± <span className="text-muted-foreground">(optional)</span>
                  </Label>
                  <Input
                    id="pq-tolerance"
                    inputMode="decimal"
                    value={draft.tolerance}
                    onChange={(event) => update({ tolerance: event.target.value })}
                    placeholder={draft.type === "number" ? "exact" : draft.type === "point" ? "0.25" : "1/40 of the range"}
                  />
                </div>
              </div>
            ) : null}

            {draft.type === "slider" ? (
              <div className="grid grid-cols-3 gap-3">
                {([
                  ["sliderMin", "From"],
                  ["sliderMax", "To"],
                  ["sliderStep", "Step (optional)"],
                ] as const).map(([key, label]) => (
                  <div key={key} className="space-y-2">
                    <Label htmlFor={`pq-${key}`}>{label}</Label>
                    <Input id={`pq-${key}`} inputMode="decimal" value={draft[key]} onChange={(event) => update({ [key]: event.target.value })} />
                  </div>
                ))}
              </div>
            ) : null}

            {draft.type === "point" ? (
              <div className="space-y-3">
                <div className="grid grid-cols-4 gap-2">
                  {([
                    ["xMin", "x from"],
                    ["xMax", "x to"],
                    ["yMin", "y from"],
                    ["yMax", "y to"],
                  ] as const).map(([key, label]) => (
                    <div key={key} className="space-y-1">
                      <Label htmlFor={`pq-${key}`} className="text-xs">{label}</Label>
                      <Input id={`pq-${key}`} inputMode="decimal" value={draft[key]} onChange={(event) => update({ [key]: event.target.value })} />
                    </div>
                  ))}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pq-plots">
                    Curves to draw <span className="text-muted-foreground">(optional, one per line, in x)</span>
                  </Label>
                  <Textarea
                    id="pq-plots"
                    rows={2}
                    value={draft.plots}
                    onChange={(event) => update({ plots: event.target.value })}
                    placeholder={"x + 1\n-x + 3"}
                    className="font-mono text-sm"
                  />
                </div>
              </div>
            ) : null}

            <div className="rounded-lg border">
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium"
                aria-expanded={showVariables}
                onClick={() => setShowVariables((value) => !value)}
              >
                <DicesIcon className="size-4 text-muted-foreground" aria-hidden="true" />
                Random numbers
                <span className="text-xs font-normal text-muted-foreground">
                  {hasVariables ? draft.variables : "new numbers every time it's played"}
                </span>
              </button>
              {showVariables ? (
                <div className="space-y-3 border-t px-3 py-3">
                  <div className="space-y-2">
                    <Label htmlFor="pq-variables">Variables</Label>
                    <Input
                      id="pq-variables"
                      value={draft.variables}
                      onChange={(event) => update({ variables: event.target.value })}
                      placeholder="a=2..9, x=-10..10, b=-20..20 !0, c=a*x+b"
                      className="font-mono text-sm"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pq-condition">
                      Condition <span className="text-muted-foreground">(optional)</span>
                    </Label>
                    <Input
                      id="pq-condition"
                      value={draft.condition}
                      onChange={(event) => update({ condition: event.target.value })}
                      placeholder="a != b and c > 0"
                      className="font-mono text-sm"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    <code>a=2..9</code> whole numbers · <code>p=0.5..3 step 0.5</code> · <code>b=-9..9 !0</code> skips 0 ·{" "}
                    <code>s=-1|1</code> one of a list · <code>c=a*x+b</code> computed. Use them as <code>{"{{a}}"}</code> in the
                    question, options and explanation, and directly in the answer.
                  </p>
                </div>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="pq-explanation">
                Explanation <span className="text-muted-foreground">(shown after answering)</span>
              </Label>
              <Textarea
                id="pq-explanation"
                rows={2}
                value={draft.explanation}
                onChange={(event) => update({ explanation: event.target.value })}
                placeholder="$2x = 12$, άρα $x = 6$."
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Label htmlFor="pq-image" className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-normal">
                <ImageIcon className="size-4" aria-hidden="true" />
                {uploading ? "Uploading…" : draft.imagePath ? "Replace image" : "Add an image"}
              </Label>
              <input
                id="pq-image"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) void uploadImage(file);
                }}
              />
              {draft.imagePath ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => update({ imagePath: null })}>
                  <Trash2Icon className="size-3.5" /> Remove image
                </Button>
              ) : null}
            </div>
          </div>

          <aside className="min-w-0 space-y-3 md:sticky md:top-0 md:self-start">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">Preview</h3>
              {hasVariables ? (
                <Button type="button" variant="outline" size="sm" onClick={() => setSeed((value) => value + 1)} disabled={!preview}>
                  <DicesIcon className="size-3.5" /> Another version
                </Button>
              ) : null}
            </div>
            <div className="rounded-lg border bg-card p-4">
              {preview ? (
                <PracticeQuestionPreview question={preview} imageUrl={draft.imagePath ? practiceImageUrl(draft.imagePath) : null} />
              ) : (
                <p className="text-sm text-muted-foreground">The preview appears once the question is complete.</p>
              )}
            </div>
            {problems.length && draft.prompt.trim() ? (
              <ul className="space-y-1 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {problems.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            ) : null}
          </aside>
        </div>

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          {!isEdit ? (
            <Button type="button" variant="outline" onClick={() => void save(true)} disabled={saving || problems.length > 0}>
              Save &amp; next
            </Button>
          ) : null}
          <Button type="button" onClick={() => void save(false)} disabled={saving || problems.length > 0}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

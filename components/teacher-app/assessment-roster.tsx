"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, CheckCheck, Undo2 } from "lucide-react";
import { toast } from "sonner";

import {
  enterAssessmentMarkAction,
  markAllAssessmentTakenAction,
  markAssessmentTakenAction,
  undoAssessmentTakenAction,
} from "@/app/protected/teacher/assessments-actions";
import { TOAST_TOP, formatCompanionDate } from "@/components/teacher-app/format";
import { getErrorMessage } from "@/lib/expected-error";
import { athensDateAndTime, athensToday } from "@/lib/push/athens-time";
import { assignmentWhen, isOverdue } from "@/lib/teacher-app/assessments";
import type { AssessmentKind, TeacherAssessmentAssignmentRow } from "@/lib/types/database";
import { cn } from "@/lib/utils";

type Row = TeacherAssessmentAssignmentRow;

/** "10:42", or "Tue 3 Nov 10:42" when it wasn't today. */
function takenLabel(takenAt: string, today: string): string {
  const { date, time } = athensDateAndTime(takenAt);
  return date === today ? time : `${formatCompanionDate(date)} ${time}`;
}

function formatScore(score: number): string {
  return Number.isInteger(score) ? String(score) : String(Number(score.toFixed(2)));
}

/**
 * One assessment's students with a big "Taken" per row - the point of the
 * phone's Tests tab. Taken rows can be undone (until scored) or given a
 * score; the full mark form (comment, graded paper) stays on the console,
 * and an edit here keeps whatever that form saved.
 */
export function AssessmentRoster({
  assessmentId,
  kind,
  maxScore,
  defaultWhen,
  notifyByDefault,
  initialRoster,
}: {
  assessmentId: string;
  kind: AssessmentKind;
  maxScore: number;
  /** The assessment's own date - a student moved to another shows theirs. */
  defaultWhen: { date: string | null; time: string | null };
  notifyByDefault: boolean;
  initialRoster: Row[];
}) {
  const router = useRouter();
  const [roster, setRoster] = useState(initialRoster);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [scoring, setScoring] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const today = athensToday();
  const now = new Date();

  const replace = (next: Row) =>
    setRoster((prev) => prev.map((row) => (row.id === next.id ? next : row)));
  const setRowBusy = (id: string, on: boolean) =>
    setBusy((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const run = async (row: Row, optimistic: Row, call: () => Promise<Row>, failure: string) => {
    replace(optimistic);
    setRowBusy(row.id, true);
    try {
      replace(await call());
      router.refresh();
    } catch (error) {
      replace(row);
      toast.error(getErrorMessage(error, failure), TOAST_TOP);
    } finally {
      setRowBusy(row.id, false);
    }
  };

  const markTaken = (row: Row) =>
    run(
      row,
      { ...row, status: "taken", taken_at: new Date().toISOString() },
      () => markAssessmentTakenAction(row.id),
      "Couldn't mark it taken",
    );

  const undo = (row: Row) =>
    run(
      row,
      { ...row, status: "registered", taken_at: null },
      () => undoAssessmentTakenAction(row.id),
      "Couldn't undo",
    );

  const saveScore = async (row: Row, score: number, notify: boolean): Promise<boolean> => {
    setRowBusy(row.id, true);
    try {
      replace(
        await enterAssessmentMarkAction(row.id, {
          score,
          // Re-saving keeps what the console's mark form attached.
          teacherComment: row.teacher_comment ?? undefined,
          gradedPaperUrl: row.graded_paper_url ?? undefined,
          notify,
        }),
      );
      setScoring(null);
      router.refresh();
      return true;
    } catch (error) {
      toast.error(getErrorMessage(error, "Couldn't save the score"), TOAST_TOP);
      return false;
    } finally {
      setRowBusy(row.id, false);
    }
  };

  const remaining = roster.filter((row) => row.status === "registered");

  const markAll = async () => {
    setConfirmAll(false);
    const before = roster;
    const at = new Date().toISOString();
    setRoster((prev) =>
      prev.map((row) =>
        row.status === "registered" ? { ...row, status: "taken", taken_at: at } : row,
      ),
    );
    try {
      const saved = await markAllAssessmentTakenAction(assessmentId);
      const updated = new Map(saved.map((row) => [row.id, row]));
      setRoster((prev) => prev.map((row) => updated.get(row.id) ?? row));
      router.refresh();
    } catch (error) {
      setRoster(before);
      toast.error(getErrorMessage(error, "Couldn't mark them taken"), TOAST_TOP);
    }
  };

  const taken = roster.length - remaining.length;
  const marked = roster.filter((row) => row.status === "marked").length;

  return (
    <section aria-label="Students" className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Taken <span className="font-semibold text-foreground">{taken}/{roster.length}</span>
          {" · "}Marked {marked}/{roster.length}
        </p>
      </div>

      {remaining.length > 1 && (
        <button
          type="button"
          onClick={() => (confirmAll ? void markAll() : setConfirmAll(true))}
          onBlur={() => setConfirmAll(false)}
          className={cn(
            "flex h-11 w-full items-center justify-center gap-2 rounded-lg border text-sm font-semibold",
            confirmAll
              ? "border-emerald-600 bg-emerald-600 text-white"
              : "border-border bg-card active:bg-muted",
          )}
        >
          <CheckCheck className="size-4" aria-hidden="true" />
          {confirmAll
            ? `Tap again: mark ${remaining.length} students taken`
            : `Mark all remaining taken (${remaining.length})`}
        </button>
      )}

      <ul className="divide-y divide-border rounded-lg border border-border bg-card">
        {roster.map((row) => {
          const when = assignmentWhen(kind, row);
          const moved = when.date !== defaultWhen.date || when.time !== defaultWhen.time;
          const overdue = isOverdue(kind, row, today, now);
          const isBusy = busy.has(row.id);
          return (
            <li key={row.id} className="px-3 py-2">
              <div className="flex min-h-12 items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{row.studentName || "Student"}</p>
                  <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                    {row.status === "registered" ? (
                      <>
                        {moved && (
                          <span>
                            Own date: {when.date ? formatCompanionDate(when.date) : "open"}
                            {when.time ? ` ${when.time}` : ""}
                          </span>
                        )}
                        {overdue && (
                          <span className="font-medium text-amber-800 dark:text-amber-300">
                            Not taken yet
                          </span>
                        )}
                      </>
                    ) : (
                      <>
                        <span>Taken {row.taken_at ? takenLabel(row.taken_at, today) : ""}</span>
                        {row.isLate && (
                          <span className="rounded-full bg-amber-500/20 px-1.5 text-[10px] font-semibold uppercase text-amber-900 dark:text-amber-300">
                            Late
                          </span>
                        )}
                      </>
                    )}
                  </p>
                </div>

                {row.status === "registered" && (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => void markTaken(row)}
                    aria-label={`Mark ${row.studentName} taken`}
                    className="flex h-11 shrink-0 items-center gap-1.5 rounded-lg border-2 border-emerald-600 px-4 text-sm font-semibold text-emerald-700 active:bg-emerald-600 active:text-white disabled:opacity-50 dark:text-emerald-400"
                  >
                    <Check className="size-4" aria-hidden="true" />
                    Taken
                  </button>
                )}

                {row.status === "taken" && (
                  <>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void undo(row)}
                      aria-label={`Undo taken for ${row.studentName}`}
                      className="flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground active:bg-muted disabled:opacity-50"
                    >
                      <Undo2 className="size-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => setScoring(scoring === row.id ? null : row.id)}
                      aria-expanded={scoring === row.id}
                      className="flex h-11 shrink-0 items-center rounded-lg border border-border px-3 text-sm font-medium active:bg-muted disabled:opacity-50"
                    >
                      Score
                    </button>
                  </>
                )}

                {row.status === "marked" && row.score !== null && (
                  <button
                    type="button"
                    onClick={() => setScoring(scoring === row.id ? null : row.id)}
                    aria-expanded={scoring === row.id}
                    aria-label={`Score ${formatScore(row.score)} of ${formatScore(maxScore)} - change`}
                    className="flex h-11 shrink-0 items-center rounded-lg bg-emerald-600/15 px-3 text-sm font-semibold tabular-nums text-emerald-800 active:bg-emerald-600/25 dark:text-emerald-300"
                  >
                    {formatScore(row.score)}/{formatScore(maxScore)}
                  </button>
                )}
              </div>

              {scoring === row.id && (
                <ScoreForm
                  key={row.id}
                  row={row}
                  maxScore={maxScore}
                  notifyByDefault={notifyByDefault && row.status !== "marked"}
                  saving={isBusy}
                  onCancel={() => setScoring(null)}
                  onSave={(score, notify) => saveScore(row, score, notify)}
                />
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ScoreForm({
  row,
  maxScore,
  notifyByDefault,
  saving,
  onCancel,
  onSave,
}: {
  row: Row;
  maxScore: number;
  notifyByDefault: boolean;
  saving: boolean;
  onCancel: () => void;
  onSave: (score: number, notify: boolean) => Promise<boolean>;
}) {
  const [value, setValue] = useState(row.score !== null ? formatScore(row.score) : "");
  const [notify, setNotify] = useState(notifyByDefault);
  const score = Number(value.replace(",", "."));
  const valid = value.trim() !== "" && Number.isFinite(score) && score >= 0 && score <= maxScore;

  return (
    <form
      className="mt-2 space-y-2 rounded-md bg-muted/50 p-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (valid) void onSave(score, notify);
      }}
    >
      <div className="flex items-center gap-2">
        <input
          type="text"
          inputMode="decimal"
          autoFocus
          aria-label={`Score for ${row.studentName} out of ${formatScore(maxScore)}`}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="h-11 w-24 rounded-md border border-input bg-background px-3 text-base tabular-nums"
        />
        <span className="text-sm text-muted-foreground">/ {formatScore(maxScore)}</span>
        <span className="flex-1" />
        <button
          type="button"
          onClick={onCancel}
          className="h-11 rounded-md px-3 text-sm text-muted-foreground active:bg-muted"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!valid || saving}
          className="h-11 rounded-md bg-emerald-600 px-4 text-sm font-semibold text-white disabled:opacity-50"
        >
          Save
        </button>
      </div>
      {row.status !== "marked" && (
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={notify}
            onChange={(event) => setNotify(event.target.checked)}
            className="size-4"
          />
          Tell the student
        </label>
      )}
    </form>
  );
}

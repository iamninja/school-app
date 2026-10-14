"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  createHomeworkAction,
  deleteHomeworkAction,
  updateHomeworkAction,
} from "@/app/protected/teacher/homework-actions";
import { NotifyCheckbox } from "@/components/notify-checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatCompanionDate, TOAST_TOP } from "@/components/teacher-app/format";
import type { CompanionClass, CompanionHomework } from "@/lib/teacher-app/load";
import { addDays } from "@/lib/teacher-app/day";
import { getErrorMessage } from "@/lib/expected-error";
import { cn } from "@/lib/utils";

type DueChoice = "next" | "week" | "pick" | "none";

/**
 * Phone homework: set homework for a class (due date via quick chips) and
 * fix or remove recent entries. Writes go through the console's homework
 * actions, so ownership checks and the "new homework" notice are the same.
 * With `classPicker`, the class can be switched (the Homework tab); without
 * it the class is fixed (a lesson's Homework segment).
 */
export function HomeworkPanel({
  classes,
  todayClassIds,
  selectedClassId,
  initialHomework,
  nextLessonDate,
  today,
  classPicker,
}: {
  classes: CompanionClass[];
  todayClassIds: string[];
  selectedClassId: string | null;
  initialHomework: CompanionHomework[];
  nextLessonDate: string | null;
  today: string;
  classPicker: boolean;
}) {
  const router = useRouter();
  const [homework, setHomework] = useState(initialHomework);
  const [note, setNote] = useState("");
  const [due, setDue] = useState<DueChoice>(nextLessonDate ? "next" : "none");
  const [pickedDate, setPickedDate] = useState("");
  const [notify, setNotify] = useState(true);
  const [saving, setSaving] = useState(false);

  const selectedClass = classes.find((item) => item.id === selectedClassId) ?? null;
  const todayClasses = todayClassIds
    .map((id) => classes.find((item) => item.id === id))
    .filter((item): item is CompanionClass => Boolean(item));
  const otherClasses = classes.filter((item) => !todayClassIds.includes(item.id));

  const dueDate =
    due === "next"
      ? nextLessonDate
      : due === "week"
        ? addDays(today, 7)
        : due === "pick"
          ? pickedDate || null
          : null;

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedClass) return;
    setSaving(true);
    try {
      const created = await createHomeworkAction({
        classId: selectedClass.id,
        note,
        dueDate,
        notify,
      });
      setHomework((current) => [created, ...current]);
      setNote("");
      toast.success("Homework set", TOAST_TOP);
    } catch (error) {
      toast.error(getErrorMessage(error, "Couldn't save the homework"), TOAST_TOP);
    } finally {
      setSaving(false);
    }
  };

  if (!selectedClass) {
    return (
      <p className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
        No active classes yet.
      </p>
    );
  }

  const chips: { value: DueChoice; label: string }[] = [
    ...(nextLessonDate
      ? [{ value: "next" as const, label: `Next lesson · ${formatCompanionDate(nextLessonDate)}` }]
      : []),
    { value: "week", label: "In a week" },
    { value: "pick", label: "Pick a date" },
    { value: "none", label: "No due date" },
  ];

  return (
    <div className="space-y-5">
      {classPicker && (
        <div className="space-y-1.5">
          <Label htmlFor="companion-homework-class">Class</Label>
          <select
            id="companion-homework-class"
            value={selectedClass.id}
            onChange={(event) =>
              router.push(`/teacher-app/homework?class=${event.target.value}`)
            }
            className="h-11 w-full rounded-md border border-input bg-background px-3 text-base"
          >
            {todayClasses.length > 0 && (
              <optgroup label="Today">
                {todayClasses.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </optgroup>
            )}
            <optgroup label={todayClasses.length > 0 ? "Other classes" : "Classes"}>
              {otherClasses.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </optgroup>
          </select>
        </div>
      )}

      <form onSubmit={handleCreate} className="space-y-3 rounded-lg border border-border bg-card p-3">
        <div className="space-y-1.5">
          <Label htmlFor="companion-homework-note">New homework</Label>
          <Textarea
            id="companion-homework-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="e.g. Exercises 3–7, page 42"
            rows={3}
            className="text-base"
          />
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Due</legend>
          <div className="flex flex-wrap gap-2">
            {chips.map((chip) => (
              <button
                key={chip.value}
                type="button"
                aria-pressed={due === chip.value}
                onClick={() => setDue(chip.value)}
                className={cn(
                  "min-h-9 rounded-full border px-3 text-sm",
                  due === chip.value
                    ? "border-brand bg-brand/10 font-medium text-foreground"
                    : "border-border text-muted-foreground",
                )}
              >
                {chip.label}
              </button>
            ))}
          </div>
          {due === "pick" && (
            <Input
              type="date"
              aria-label="Due date"
              value={pickedDate}
              min={today}
              onChange={(event) => setPickedDate(event.target.value)}
              className="h-11 text-base"
            />
          )}
        </fieldset>

        <NotifyCheckbox id="companion-homework-notify" checked={notify} onChange={setNotify} />

        <Button type="submit" className="h-11 w-full" disabled={saving || !note.trim()}>
          {saving ? "Saving…" : `Set homework for ${selectedClass.name}`}
        </Button>
      </form>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Recent homework</h2>
        {homework.length === 0 ? (
          <p className="text-sm text-muted-foreground">No homework for this class yet.</p>
        ) : (
          <ul className="space-y-2">
            {homework.map((item) => (
              <HomeworkItem
                key={item.id}
                item={item}
                today={today}
                onUpdated={(updated) =>
                  setHomework((current) =>
                    current.map((entry) => (entry.id === updated.id ? updated : entry)),
                  )
                }
                onDeleted={(id) =>
                  setHomework((current) => current.filter((entry) => entry.id !== id))
                }
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function HomeworkItem({
  item,
  today,
  onUpdated,
  onDeleted,
}: {
  item: CompanionHomework;
  today: string;
  onUpdated: (item: CompanionHomework) => void;
  onDeleted: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState(item.note);
  const [dueDate, setDueDate] = useState(item.due_date ?? "");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleSave = async () => {
    setBusy(true);
    try {
      const updated = await updateHomeworkAction(item.id, { note, dueDate: dueDate || null });
      onUpdated(updated);
      setEditing(false);
    } catch (error) {
      toast.error(getErrorMessage(error, "Couldn't update the homework"), TOAST_TOP);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    setBusy(true);
    try {
      await deleteHomeworkAction(item.id);
      onDeleted(item.id);
    } catch (error) {
      toast.error(getErrorMessage(error, "Couldn't delete the homework"), TOAST_TOP);
      setBusy(false);
    }
  };

  if (editing) {
    return (
      <li className="space-y-2 rounded-lg border border-brand/50 bg-card p-3">
        <Textarea
          aria-label="Homework note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={3}
          className="text-base"
        />
        <Input
          type="date"
          aria-label="Due date"
          value={dueDate}
          onChange={(event) => setDueDate(event.target.value)}
          className="h-11 text-base"
        />
        <div className="flex gap-2">
          <Button
            type="button"
            className="h-11 flex-1"
            disabled={busy || !note.trim()}
            onClick={handleSave}
          >
            Save
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-11 flex-1"
            disabled={busy}
            onClick={() => {
              setNote(item.note);
              setDueDate(item.due_date ?? "");
              setEditing(false);
            }}
          >
            Cancel
          </Button>
        </div>
      </li>
    );
  }

  const overdue = item.due_date !== null && item.due_date < today;

  return (
    <li className="rounded-lg border border-border bg-card p-3">
      <p className="whitespace-pre-wrap text-sm">{item.note}</p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className={cn("text-xs", overdue ? "text-muted-foreground" : "text-foreground")}>
          {item.due_date ? `Due ${formatCompanionDate(item.due_date)}` : "No due date"}
          {" · set "}
          {formatCompanionDate(item.created_at.slice(0, 10))}
        </span>
        <div className="flex shrink-0 gap-1">
          {confirmingDelete ? (
            <>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="h-9"
                disabled={busy}
                onClick={handleDelete}
              >
                Delete
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-9"
                disabled={busy}
                onClick={() => setConfirmingDelete(false)}
              >
                Keep
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-9"
                aria-label="Edit homework"
                onClick={() => setEditing(true)}
              >
                <Pencil className="size-4" aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-9"
                aria-label="Delete homework"
                onClick={() => setConfirmingDelete(true)}
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </Button>
            </>
          )}
        </div>
      </div>
    </li>
  );
}

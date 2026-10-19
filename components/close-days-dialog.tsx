"use client";

import * as React from "react";
import { format } from "date-fns";
import { toast } from "sonner";

import { cancelLessonsForClosureAction } from "@/app/protected/teacher/calendar-actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NotifyCheckbox } from "@/components/notify-checkbox";
import {
  eachIsoDateInRange,
  fromIsoDate,
  type Occurrence,
  type ProjectionClass,
  type ProjectionEvent,
  type ProjectionSlot,
} from "@/lib/calendar-projection";
import { getErrorMessage } from "@/lib/expected-error";
import {
  CANCELLATION_REASONS,
  CANCELLATION_REASON_LABELS_EN,
  MAX_CLOSURE_DAYS,
  planClosure,
  upcomingClosurePresets,
  type CancellationReason,
} from "@/lib/school-closures";
import type { CalendarEvent } from "@/lib/types/database";

const SELECT_CLASSES =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";

function occurrenceLine(occurrence: Occurrence): string {
  const name =
    occurrence.className ??
    occurrence.studentName ??
    occurrence.contactName ??
    "Untitled";
  return `${format(fromIsoDate(occurrence.date), "EEE d MMM")}${occurrence.startTime ? ` · ${occurrence.startTime}` : ""} · ${name}`;
}

// "Close days": cancel every scheduled lesson over a date range for one
// reason - a holiday break, a public holiday, a weather day, a strike.
// The preview runs the same planClosure() the server action does, so what
// the teacher sees listed is exactly what gets cancelled. Mounted only
// while open, so every opening starts from a fresh form on the day the
// teacher is looking at.
export function CloseDaysDialog({
  open,
  onOpenChange,
  initialDate,
  today,
  slots,
  classes,
  events,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialDate: string;
  today: string;
  slots: ProjectionSlot[];
  classes: ProjectionClass[];
  events: ProjectionEvent[];
  onCreated: (cancellations: CalendarEvent[]) => void;
}) {
  const presets = React.useMemo(() => upcomingClosurePresets(today), [today]);
  const [presetKey, setPresetKey] = React.useState("");
  const [reason, setReason] = React.useState<CancellationReason>("weather");
  const [from, setFrom] = React.useState(initialDate);
  const [to, setTo] = React.useState(initialDate);
  const [notes, setNotes] = React.useState("");
  const [notify, setNotify] = React.useState(true);
  const [isSaving, setIsSaving] = React.useState(false);

  const choosePreset = (key: string) => {
    setPresetKey(key);
    const preset = presets.find((item) => item.key === key);
    if (!preset) return;
    setReason(preset.reason);
    setFrom(preset.from);
    setTo(preset.to);
    setNotes(preset.noteEl ?? "");
  };

  const rangeError = !from || !to
    ? "Pick the first and last day"
    : to < from
      ? "The last day can't be before the first day"
      : eachIsoDateInRange(from, to).length > MAX_CLOSURE_DAYS
        ? `Close at most ${MAX_CLOSURE_DAYS} days at a time`
        : null;

  const plan = React.useMemo(
    () =>
      rangeError
        ? { toCancel: [], notCovered: [] }
        : planClosure({ from, to, slots, classes, events }),
    [rangeError, from, to, slots, classes, events],
  );

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (rangeError || plan.toCancel.length === 0) return;
    setIsSaving(true);
    try {
      const result = await cancelLessonsForClosureAction({
        from,
        to,
        reason,
        notes,
        notify,
      });
      onCreated(result.cancellations);
      toast.success(
        `Cancelled ${result.cancellations.length} lesson${result.cancellations.length === 1 ? "" : "s"}`,
      );
      onOpenChange(false);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to cancel the lessons"));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Close days</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="closure-preset">Holiday</Label>
            <select
              id="closure-preset"
              value={presetKey}
              onChange={(e) => choosePreset(e.target.value)}
              className={SELECT_CLASSES}
            >
              <option value="">Custom dates</option>
              {presets.map((preset) => (
                <option key={preset.key} value={preset.key}>
                  {preset.label} ·{" "}
                  {preset.from === preset.to
                    ? format(fromIsoDate(preset.from), "EEE d MMM yyyy")
                    : `${format(fromIsoDate(preset.from), "d MMM")} – ${format(fromIsoDate(preset.to), "d MMM yyyy")}`}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="closure-reason">Reason</Label>
            <select
              id="closure-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value as CancellationReason)}
              className={SELECT_CLASSES}
            >
              {CANCELLATION_REASONS.map((item) => (
                <option key={item} value={item}>
                  {CANCELLATION_REASON_LABELS_EN[item]}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="closure-from">First day</Label>
              <Input
                id="closure-from"
                type="date"
                value={from}
                onChange={(e) => {
                  const value = e.target.value;
                  setFrom(value);
                  if (to < value) setTo(value);
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="closure-to">Last day</Label>
              <Input
                id="closure-to"
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="closure-notes">
              Note for students and parents (optional)
            </Label>
            <Input
              id="closure-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Απεργία ΜΜΜ, χιονόπτωση, ..."
            />
          </div>

          <div className="space-y-1 rounded-md border p-3 text-sm">
            {rangeError ? (
              <p className="text-destructive">{rangeError}</p>
            ) : plan.toCancel.length === 0 ? (
              <p className="text-muted-foreground">
                No scheduled lessons on these days.
              </p>
            ) : (
              <>
                <p className="font-medium">
                  {plan.toCancel.length} lesson
                  {plan.toCancel.length === 1 ? "" : "s"} will be cancelled:
                </p>
                <ul className="max-h-40 space-y-0.5 overflow-y-auto text-muted-foreground">
                  {plan.toCancel.map((occurrence) => (
                    <li
                      key={`${occurrence.classId}|${occurrence.date}|${occurrence.slotTime}`}
                    >
                      {occurrenceLine(occurrence)}
                    </li>
                  ))}
                </ul>
              </>
            )}
            {!rangeError && plan.notCovered.length > 0 ? (
              <div className="mt-2 border-t pt-2">
                <p className="font-medium">
                  Not cancelled - delete or move these one by one:
                </p>
                <ul className="space-y-0.5 text-muted-foreground">
                  {plan.notCovered.map((occurrence) => (
                    <li key={occurrence.eventId ?? occurrenceLine(occurrence)}>
                      {occurrenceLine(occurrence)}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          <NotifyCheckbox
            id="closure-notify"
            checked={notify}
            onChange={setNotify}
            label="Notify students (one message per class)"
          />

          <DialogFooter>
            <Button
              type="submit"
              disabled={isSaving || !!rangeError || plan.toCancel.length === 0}
              className="w-full"
            >
              {isSaving ? "Cancelling..." : "Cancel these lessons"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

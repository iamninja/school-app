"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { setTrialOutcomeAction } from "@/app/protected/teacher/calendar-actions";
import { TOAST_TOP } from "@/components/teacher-app/format";
import { getErrorMessage } from "@/lib/expected-error";
import type { TrialOutcome } from "@/lib/types/database";
import { cn } from "@/lib/utils";

const OPTIONS: { outcome: TrialOutcome; label: string; active: string }[] = [
  { outcome: "came", label: "Came", active: "bg-emerald-600 text-white border-emerald-600" },
  { outcome: "no_show", label: "Didn't come", active: "bg-destructive text-white border-destructive" },
];

/**
 * A trial lesson's came / no-show mark on the Today screen - the teacher's
 * own record (the contact isn't a student). Tapping the chosen one clears it.
 */
export function TrialOutcomeButtons({
  eventId,
  initialOutcome,
}: {
  eventId: string;
  initialOutcome: TrialOutcome | null;
}) {
  const router = useRouter();
  const [outcome, setOutcome] = useState(initialOutcome);
  const [saving, setSaving] = useState(false);

  const choose = async (next: TrialOutcome) => {
    const previous = outcome;
    const value = outcome === next ? null : next;
    setOutcome(value);
    setSaving(true);
    try {
      await setTrialOutcomeAction(eventId, value);
      router.refresh();
    } catch (error) {
      setOutcome(previous);
      toast.error(getErrorMessage(error, "Couldn't save"), TOAST_TOP);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex shrink-0 gap-1.5" role="group" aria-label="Trial outcome">
      {OPTIONS.map((option) => (
        <button
          key={option.outcome}
          type="button"
          disabled={saving}
          aria-pressed={outcome === option.outcome}
          onClick={() => void choose(option.outcome)}
          className={cn(
            "h-9 rounded-md border px-2.5 text-xs font-medium",
            outcome === option.outcome ? option.active : "border-border bg-background",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

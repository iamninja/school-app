"use client";

import { useState } from "react";
import { CheckCheck } from "lucide-react";
import { toast } from "sonner";

import { setAttendanceAction } from "@/app/protected/teacher/actions";
import { Button } from "@/components/ui/button";
import type { CompanionStudent } from "@/lib/teacher-app/load";
import type { AttendanceStatus } from "@/lib/attendance-records";
import { getErrorMessage } from "@/lib/expected-error";
import { formatEuro } from "@/lib/format-currency";
import { cn } from "@/lib/utils";

type Mark = { status: AttendanceStatus; chargedAmount: number | null };

const OPTIONS: { status: AttendanceStatus; label: string; active: string }[] = [
  { status: "present", label: "Present", active: "bg-emerald-600 text-white border-emerald-600" },
  { status: "late", label: "Late", active: "bg-amber-500 text-white border-amber-500" },
  { status: "absent", label: "Absent", active: "bg-destructive text-white border-destructive" },
  { status: "split", label: "1+1", active: "bg-sky-600 text-white border-sky-600" },
];

/**
 * Phone attendance: one card per student with big Present / Late / Absent
 * (and 1+1 on two-hour lessons) buttons. Same write as the console's roster
 * (setAttendanceAction - billing, absence notices and all); tapping the
 * active status clears it. Each tap shows at once and rolls back if the save
 * fails.
 */
export function LessonAttendance({
  classId,
  className,
  date,
  isTwoHour,
  isPerLesson,
  roster,
  initialMarks,
}: {
  classId: string;
  className: string;
  date: string;
  isTwoHour: boolean;
  isPerLesson: boolean;
  roster: CompanionStudent[];
  initialMarks: Record<string, Mark>;
}) {
  const [marks, setMarks] = useState<Record<string, Mark>>(initialMarks);
  const [markingRest, setMarkingRest] = useState(false);

  const options = OPTIONS.filter((option) => option.status !== "split" || isTwoHour);
  const markedCount = roster.filter((student) => marks[student.id]).length;
  const absentCount = roster.filter((student) => marks[student.id]?.status === "absent").length;
  const unmarked = roster.filter((student) => !marks[student.id]);

  const save = async (studentId: string, status: AttendanceStatus | ""): Promise<boolean> => {
    const previous = marks[studentId];
    setMarks((current) => {
      const next = { ...current };
      if (status) next[studentId] = { status, chargedAmount: null };
      else delete next[studentId];
      return next;
    });
    try {
      const result = await setAttendanceAction({
        classId,
        className,
        studentId,
        attendanceDate: date,
        status,
      });
      if (status) {
        setMarks((current) => ({
          ...current,
          [studentId]: { status, chargedAmount: result.chargedAmount },
        }));
      }
      return true;
    } catch (error) {
      setMarks((current) => {
        const next = { ...current };
        if (previous) next[studentId] = previous;
        else delete next[studentId];
        return next;
      });
      toast.error(getErrorMessage(error, "Couldn't save attendance"));
      return false;
    }
  };

  const markRestPresent = async () => {
    setMarkingRest(true);
    // One at a time through the same action, so billing and notices behave
    // exactly as if each student had been tapped.
    for (const student of unmarked) {
      if (!(await save(student.id, "present"))) break;
    }
    setMarkingRest(false);
  };

  if (roster.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
        No students assigned to this class yet.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {markedCount}/{roster.length} marked
          {absentCount > 0 && ` · ${absentCount} absent`}
        </p>
        {unmarked.length > 0 && (
          <Button
            type="button"
            variant="outline"
            className="h-11"
            disabled={markingRest}
            onClick={markRestPresent}
          >
            <CheckCheck className="size-4" aria-hidden="true" />
            {markingRest ? "Saving…" : "Mark the rest present"}
          </Button>
        )}
      </div>

      <ul className="space-y-2">
        {roster.map((student) => {
          const mark = marks[student.id];
          const fullName = `${student.firstName} ${student.lastName}`;
          return (
            <li key={student.id} className="rounded-lg border border-border bg-card p-3">
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <span className="truncate font-medium">{fullName}</span>
                {isPerLesson && mark && (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {typeof mark.chargedAmount === "number"
                      ? `${formatEuro(mark.chargedAmount)} charged`
                      : "Not charged"}
                  </span>
                )}
              </div>
              <div
                role="group"
                aria-label={`Attendance for ${fullName}`}
                className={cn("grid gap-2", options.length === 4 ? "grid-cols-4" : "grid-cols-3")}
              >
                {options.map((option) => {
                  const active = mark?.status === option.status;
                  return (
                    <button
                      key={option.status}
                      type="button"
                      aria-pressed={active}
                      disabled={markingRest}
                      onClick={() => save(student.id, active ? "" : option.status)}
                      className={cn(
                        "h-11 rounded-md border text-sm font-medium transition-colors disabled:opacity-60",
                        active ? option.active : "border-border bg-background active:bg-muted",
                      )}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

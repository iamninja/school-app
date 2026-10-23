"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { CheckCheck, CloudOff } from "lucide-react";
import { toast } from "sonner";

import { setAttendanceAction } from "@/app/protected/teacher/actions";
import { Button } from "@/components/ui/button";
import { ContactMenu } from "@/components/teacher-app/contact-menu";
import { TOAST_TOP } from "@/components/teacher-app/format";
import type { CompanionStudent } from "@/lib/teacher-app/load";
import type { AttendanceStatus } from "@/lib/attendance-records";
import { getErrorMessage } from "@/lib/expected-error";
import {
  dropQueuedMark,
  enqueueMark,
  getQueueSnapshot,
  getServerQueueSnapshot,
  isNetworkError,
  subscribeToQueue,
} from "@/lib/teacher-app/attendance-queue";
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
 * active status clears it. Each tap shows at once. If the server refuses it,
 * it rolls back; if there's no signal, it stays and waits in the attendance
 * queue (lib/teacher-app/attendance-queue.ts), which the companion shell
 * sends as soon as the connection is back.
 */
export function LessonAttendance({
  classId,
  className,
  eventId,
  date,
  isTwoHour,
  isPerLesson,
  roster,
  initialMarks,
}: {
  classId: string;
  className: string;
  /** A one-off lesson: marks belong to this calendar event (classId is ""). */
  eventId?: string;
  date: string;
  isTwoHour: boolean;
  isPerLesson: boolean;
  roster: CompanionStudent[];
  initialMarks: Record<string, Mark>;
}) {
  const [localMarks, setMarks] = useState<Record<string, Mark>>(initialMarks);
  const [markingRest, setMarkingRest] = useState(false);
  const queue = useSyncExternalStore(subscribeToQueue, getQueueSnapshot, getServerQueueSnapshot);

  // Marks still waiting for signal win over what the server last said, so
  // they show again after the app is reopened.
  const { marks, pending } = useMemo(() => {
    const merged = { ...localMarks };
    const waiting = new Set<string>();
    for (const entry of queue) {
      const sameLesson = eventId
        ? entry.eventId === eventId
        : !entry.eventId && entry.classId === classId;
      if (!sameLesson || entry.date !== date) continue;
      waiting.add(entry.studentId);
      if (entry.status) merged[entry.studentId] = { status: entry.status, chargedAmount: null };
      else delete merged[entry.studentId];
    }
    return { marks: merged, pending: waiting };
  }, [localMarks, queue, classId, eventId, date]);

  const options = OPTIONS.filter((option) => option.status !== "split" || isTwoHour);
  const markedCount = roster.filter((student) => marks[student.id]).length;
  const absentCount = roster.filter((student) => marks[student.id]?.status === "absent").length;
  const unmarked = roster.filter((student) => !marks[student.id]);

  const save = async (student: CompanionStudent, status: AttendanceStatus | ""): Promise<boolean> => {
    const studentId = student.id;
    const previous = marks[studentId];
    setMarks((current) => {
      const next = { ...current };
      if (status) next[studentId] = { status, chargedAmount: null };
      else delete next[studentId];
      return next;
    });
    const queueEntry = () =>
      enqueueMark({
        classId,
        ...(eventId ? { eventId } : {}),
        className,
        date,
        studentId,
        studentName: `${student.firstName} ${student.lastName}`,
        status,
        queuedAt: Date.now(),
      });
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      queueEntry();
      return true;
    }
    // This tap is newer than anything still queued for the student.
    dropQueuedMark({ classId, eventId, date, studentId });
    try {
      const result = await setAttendanceAction({
        classId,
        className,
        studentId,
        attendanceDate: date,
        status,
        ...(eventId ? { eventId } : {}),
      });
      if (status) {
        setMarks((current) => ({
          ...current,
          [studentId]: { status, chargedAmount: result.chargedAmount },
        }));
      }
      return true;
    } catch (error) {
      if (isNetworkError(error)) {
        queueEntry();
        return true;
      }
      setMarks((current) => {
        const next = { ...current };
        if (previous) next[studentId] = previous;
        else delete next[studentId];
        return next;
      });
      toast.error(getErrorMessage(error, "Couldn't save attendance"), TOAST_TOP);
      return false;
    }
  };

  const markRestPresent = async () => {
    setMarkingRest(true);
    // One at a time through the same action, so billing and notices behave
    // exactly as if each student had been tapped.
    for (const student of unmarked) {
      if (!(await save(student, "present"))) break;
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
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="min-w-0 flex-1 truncate font-medium">{fullName}</span>
                {pending.has(student.id) ? (
                  <span className="flex shrink-0 items-center gap-1 text-xs text-amber-700 dark:text-amber-400">
                    <CloudOff className="size-3.5" aria-hidden="true" />
                    Waiting for signal
                  </span>
                ) : isPerLesson && mark && (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {typeof mark.chargedAmount === "number"
                      ? `${formatEuro(mark.chargedAmount)} charged`
                      : "Not charged"}
                  </span>
                )}
                <ContactMenu studentName={fullName} contacts={student.contacts ?? []} />
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
                      onClick={() => save(student, active ? "" : option.status)}
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

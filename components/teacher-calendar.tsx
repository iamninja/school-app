"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import {
  CalendarClockIcon,
  PencilIcon,
  PlusIcon,
  TriangleAlertIcon,
  Trash2Icon,
  UndoIcon,
} from "lucide-react";

import {
  createCalendarEventAction,
  deleteCalendarEventAction,
  rescheduleClassOccurrenceAction,
  updateCalendarEventAction,
} from "@/app/protected/teacher/calendar-actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, CalendarDayButton } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AttendanceRosterTable } from "@/components/attendance-roster-table";
import { cn } from "@/lib/utils";
import {
  eachIsoDateInRange,
  fromIsoDate,
  groupOccurrencesByDate,
  projectOccurrences,
  toIsoDate,
  weekdayLabelFromDate,
  type Occurrence,
  type OccurrenceKind,
  type ProjectionClass,
  type ProjectionEvent,
  type ProjectionSlot,
} from "@/lib/calendar-projection";
import { lessonTimeLabel, recurringLessonWindow } from "@/lib/schedule-grid";
import {
  upsertAttendanceRecord,
  type AttendanceRecord,
} from "@/lib/attendance-records";
import type {
  CalendarEvent,
  CalendarEventInput,
  CalendarEventType,
} from "@/lib/types/database";

type StudentOption = {
  id: string;
  firstName: string;
  lastName: string;
  withdrawnAt?: string | null;
  gradeLevel: string;
  email: string;
  assignedClassIds: string[];
};

// Cancellation is deliberately not one of the addable types here - it's
// created via the "Cancel this class" action on a recurring occurrence row,
// which already knows the class/date/time, rather than through a form.
type AddableEventType = Exclude<CalendarEventType, "cancellation">;

const ADDABLE_TYPES: { type: AddableEventType; label: string }[] = [
  { type: "extra_session", label: "Extra session" },
  { type: "ad_hoc_lesson", label: "One-off lesson" },
  { type: "trial_lesson", label: "Trial lesson" },
  { type: "block", label: "Personal block" },
];

const TYPE_LABELS: Record<CalendarEventType, string> = {
  cancellation: "Cancellation",
  extra_session: "Extra session",
  ad_hoc_lesson: "One-off lesson",
  trial_lesson: "Trial lesson",
  block: "Personal block",
};

const KIND_DOT_CLASSES: Record<OccurrenceKind, string> = {
  recurring: "bg-muted-foreground/50",
  cancelled: "bg-rose-500",
  extra_session: "bg-teal-500",
  ad_hoc_lesson: "bg-violet-500",
  trial_lesson: "bg-amber-500",
  block: "bg-sky-500",
};

// Mock exam dates shown on the grid - a read-only overlay, not an
// OccurrenceKind (they aren't projected occurrences and don't come from
// calendar_events), so they get their own dot color rather than a slot in
// KIND_DOT_CLASSES.
const TEST_DOT_CLASS = "bg-indigo-500";

export type TestDateMarker = {
  testId: string;
  date: string;
  label: string;
  studentCount: number;
};

const WEEK_ROW_CLASSES: Record<OccurrenceKind, string> = {
  recurring: "border-border bg-muted/40",
  cancelled:
    "border-rose-500/30 bg-rose-500/10 text-muted-foreground line-through",
  extra_session: "border-teal-500/30 bg-teal-500/10",
  ad_hoc_lesson: "border-violet-500/30 bg-violet-500/10",
  trial_lesson: "border-amber-500/30 bg-amber-500/10",
  block: "border-sky-500/30 bg-sky-500/10",
};

const WEEK_KIND_LABELS: Partial<Record<OccurrenceKind, string>> = {
  cancelled: "Cancelled",
  extra_session: "Extra",
  ad_hoc_lesson: "One-off",
  trial_lesson: "Trial",
  block: "Personal",
};

// Read-only week strip shown below the month view: whatever week the
// selected date falls in, Monday-first (matching the Schedule tab's
// weekday convention), with cancelled/extra/one-off occurrences all
// visible alongside the recurring template - no per-row actions here,
// deliberately, per explicit request. Cancelling/adding still happens via
// the day-detail panel above.
type OverlapPair = {
  date: string;
  a: { name: string; startTime: string; endTime: string | null };
  b: { name: string; startTime: string; endTime: string | null };
};

function lessonLabel(occurrence: Occurrence): string {
  return (
    occurrence.className ??
    occurrence.studentName ??
    occurrence.contactName ??
    "Untitled"
  );
}

function formatTimeRange(startTime: string, endTime: string | null): string {
  return endTime ? `${startTime}–${endTime}` : startTime;
}

// A stored end_time wins when present. Otherwise: a recurring class
// occurrence's real teaching window comes from the schedule grid's own row
// spacing (confirmed with the user - every lesson is 45 minutes, with a
// 15-minute break baked into most slots except the grid's first two rows,
// which run back to back). Any other lesson type left without an end time
// gets the same flat 45-minute assumption, just not grid-aligned.
const DEFAULT_LESSON_MINUTES = 45;

function effectiveWindow(
  occurrence: Occurrence,
): { start: string; end: string } | null {
  if (occurrence.startTime === null) return null;
  if (occurrence.endTime) {
    return { start: occurrence.startTime, end: occurrence.endTime };
  }
  if (occurrence.kind === "recurring") {
    const weekday = weekdayLabelFromDate(fromIsoDate(occurrence.date));
    return recurringLessonWindow(weekday, occurrence.startTime, occurrence.isTwoHour);
  }
  const [hours, minutes] = occurrence.startTime.split(":").map(Number);
  const endTotal = hours * 60 + minutes + DEFAULT_LESSON_MINUTES;
  const endHours = String(Math.floor(endTotal / 60) % 24).padStart(2, "0");
  const endMinutes = String(endTotal % 60).padStart(2, "0");
  return { start: occurrence.startTime, end: `${endHours}:${endMinutes}` };
}


// Cancelled occurrences and blocks are excluded - a cancelled lesson
// doesn't happen, and a block isn't a class. Reported pairwise rather than
// grouped, since interval overlap isn't guaranteed transitive across three
// or more lessons.
function findOverlappingLessons(
  occurrencesByDate: Map<string, Occurrence[]>,
  days: string[],
): OverlapPair[] {
  const overlaps: OverlapPair[] = [];
  for (const day of days) {
    const dayOccurrences = (occurrencesByDate.get(day) ?? []).filter(
      (occurrence) =>
        occurrence.kind !== "cancelled" &&
        occurrence.kind !== "block" &&
        occurrence.startTime !== null,
    );
    for (let i = 0; i < dayOccurrences.length; i += 1) {
      for (let j = i + 1; j < dayOccurrences.length; j += 1) {
        const a = dayOccurrences[i];
        const b = dayOccurrences[j];
        const winA = effectiveWindow(a);
        const winB = effectiveWindow(b);
        if (!winA || !winB) continue;
        if (!(winA.start < winB.end && winB.start < winA.end)) continue;
        overlaps.push({
          date: day,
          a: { name: lessonLabel(a), startTime: winA.start, endTime: winA.end },
          b: { name: lessonLabel(b), startTime: winB.start, endTime: winB.end },
        });
      }
    }
  }
  return overlaps;
}

function WeeklyOverview({
  selectedDate,
  slots,
  classes,
  events,
  onSelectDate,
}: {
  selectedDate: string;
  slots: ProjectionSlot[];
  classes: ProjectionClass[];
  events: ProjectionEvent[];
  onSelectDate: (date: string) => void;
}) {
  const weekStart = startOfWeek(fromIsoDate(selectedDate), {
    weekStartsOn: 1,
  });
  const weekEnd = endOfWeek(fromIsoDate(selectedDate), { weekStartsOn: 1 });
  const from = toIsoDate(weekStart);
  const to = toIsoDate(weekEnd);

  // React Compiler auto-memoizes this component - no manual useMemo needed.
  const occurrencesByDate = groupOccurrencesByDate(
    projectOccurrences({ from, to, slots, classes, events, includeBlocks: true }),
  );
  const days = eachIsoDateInRange(from, to);
  const overlaps = findOverlappingLessons(occurrencesByDate, days);
  const overlapDates = new Set(overlaps.map((overlap) => overlap.date));
  const todayIso = toIsoDate(new Date());

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Week of {format(weekStart, "d MMM")} – {format(weekEnd, "d MMM yyyy")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-7">
          {days.map((day) => {
            const dayOccurrences = occurrencesByDate.get(day) ?? [];
            return (
              <button
                key={day}
                type="button"
                aria-pressed={day === selectedDate}
                onClick={() => onSelectDate(day)}
                className={cn(
                  "w-full rounded-md border p-2 text-left transition-colors hover:bg-accent",
                  overlapDates.has(day)
                    ? "border-rose-500 ring-1 ring-rose-500"
                    : day === selectedDate &&
                        "border-primary ring-1 ring-primary",
                )}
              >
                <p
                  className={cn(
                    "flex items-center gap-1 text-xs font-semibold text-muted-foreground",
                    overlapDates.has(day) && "text-rose-600 dark:text-rose-400",
                  )}
                >
                  {overlapDates.has(day) && (
                    <TriangleAlertIcon className="h-3 w-3" />
                  )}
                  {format(fromIsoDate(day), "EEE d")}
                  {day === todayIso && (
                    <span className="rounded-full bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-medium text-sky-600 dark:text-sky-400">
                      Today
                    </span>
                  )}
                </p>
                <div className="mt-1.5 space-y-1.5">
                  {dayOccurrences.length === 0 ? (
                    <p className="text-xs text-muted-foreground">—</p>
                  ) : (
                    dayOccurrences.map((occurrence, idx) => (
                      <div
                        key={idx}
                        className={cn(
                          "rounded border px-1.5 py-1 text-xs",
                          WEEK_ROW_CLASSES[occurrence.kind],
                        )}
                      >
                        <p className="font-medium">
                          {occurrence.startTime
                            ? lessonTimeLabel(
                                occurrence.startTime,
                                occurrence.isTwoHour,
                                occurrence.endTime,
                              )
                            : "All day"}
                        </p>
                        <p className="truncate">
                          {occurrence.className ??
                            occurrence.studentName ??
                            occurrence.contactName ??
                            occurrence.title ??
                            "Untitled"}
                        </p>
                        {WEEK_KIND_LABELS[occurrence.kind] ? (
                          <p className="text-[10px] tracking-wide uppercase opacity-70">
                            {WEEK_KIND_LABELS[occurrence.kind]}
                          </p>
                        ) : null}
                      </div>
                    ))
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {overlaps.length > 0 && (
          <Alert variant="destructive" className="mt-4">
            <TriangleAlertIcon />
            <AlertTitle>Overlapping lessons this week</AlertTitle>
            <AlertDescription>
              <ul className="space-y-0.5">
                {overlaps.map((overlap, idx) => (
                  <li key={idx}>
                    {format(fromIsoDate(overlap.date), "EEE d MMM")}:{" "}
                    {overlap.a.name} (
                    {formatTimeRange(overlap.a.startTime, overlap.a.endTime)})
                    overlaps {overlap.b.name} (
                    {formatTimeRange(overlap.b.startTime, overlap.b.endTime)})
                  </li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

type FormState = {
  eventType: AddableEventType;
  eventDate: string;
  classId: string;
  studentId: string;
  contactName: string;
  contactPhone: string;
  title: string;
  startTime: string;
  endTime: string;
  allDay: boolean;
  notes: string;
};

function blankForm(eventType: AddableEventType, eventDate: string): FormState {
  return {
    eventType,
    eventDate,
    classId: "",
    studentId: "",
    contactName: "",
    contactPhone: "",
    title: "",
    startTime: "",
    endTime: "",
    allDay: false,
    notes: "",
  };
}

function formFromEvent(event: CalendarEvent): FormState {
  return {
    eventType: event.event_type as AddableEventType,
    eventDate: event.event_date,
    classId: event.class_id ?? "",
    studentId: event.student_id ?? "",
    contactName: event.contact_name ?? "",
    contactPhone: event.contact_phone ?? "",
    title: event.title ?? "",
    startTime: event.start_time ?? "",
    endTime: event.end_time ?? "",
    allDay: event.start_time === null,
    notes: event.notes ?? "",
  };
}

function formToInput(form: FormState): CalendarEventInput {
  return {
    eventType: form.eventType,
    eventDate: form.eventDate,
    startTime: form.allDay ? null : form.startTime || null,
    endTime: form.allDay ? null : form.endTime || null,
    classId: form.classId || null,
    studentId: form.studentId || null,
    contactName: form.contactName,
    contactPhone: form.contactPhone,
    title: form.title,
    notes: form.notes,
  };
}

export function TeacherCalendar({
  events,
  onEventsChange,
  classes,
  students,
  slots,
  attendanceRecords,
  onAttendanceRecordsChange,
  testMarkers = [],
  onViewTest,
}: {
  events: CalendarEvent[];
  onEventsChange: React.Dispatch<React.SetStateAction<CalendarEvent[]>>;
  classes: ProjectionClass[];
  students: StudentOption[];
  slots: ProjectionSlot[];
  attendanceRecords: AttendanceRecord[];
  onAttendanceRecordsChange: React.Dispatch<
    React.SetStateAction<AttendanceRecord[]>
  >;
  // Read-only overlay of mock exam dates - never written back into
  // calendar_events, see supabase/migrations/*_tests.sql and
  // lib/test-status.ts. Purely for visibility on the grid.
  testMarkers?: TestDateMarker[];
  onViewTest?: (testId: string) => void;
}) {
  const [month, setMonth] = React.useState(() => new Date());
  const [selectedDate, setSelectedDate] = React.useState(() =>
    toIsoDate(new Date()),
  );
  const [dialog, setDialog] = React.useState<
    | { mode: "create"; type: AddableEventType }
    | { mode: "edit"; event: CalendarEvent }
    | null
  >(null);
  const [form, setForm] = React.useState<FormState>(() =>
    blankForm("extra_session", selectedDate),
  );
  const [isSaving, setIsSaving] = React.useState(false);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [cancellingKey, setCancellingKey] = React.useState<string | null>(
    null,
  );
  const [rescheduleTarget, setRescheduleTarget] =
    React.useState<Occurrence | null>(null);
  const [rescheduleDate, setRescheduleDate] = React.useState("");
  const [rescheduleStartTime, setRescheduleStartTime] = React.useState("");
  const [rescheduleEndTime, setRescheduleEndTime] = React.useState("");
  const [isRescheduling, setIsRescheduling] = React.useState(false);

  const projectionEvents: ProjectionEvent[] = events;
  const activeClassOptions = classes.filter((item) => !item.archivedAt);
  const activeStudentOptions = students.filter((item) => !item.withdrawnAt);
  const withdrawnStudentOptions = students.filter((item) => item.withdrawnAt);

  const monthOccurrences = React.useMemo(() => {
    const from = toIsoDate(startOfWeek(startOfMonth(month)));
    const to = toIsoDate(endOfWeek(endOfMonth(month)));
    return projectOccurrences({
      from,
      to,
      slots,
      classes,
      events: projectionEvents,
      includeBlocks: true,
    });
  }, [month, slots, classes, projectionEvents]);

  const kindsByDate = React.useMemo(() => {
    const map = new Map<string, Set<OccurrenceKind>>();
    for (const occurrence of monthOccurrences) {
      const set = map.get(occurrence.date) ?? new Set<OccurrenceKind>();
      set.add(occurrence.kind);
      map.set(occurrence.date, set);
    }
    return map;
  }, [monthOccurrences]);

  const testMarkersByDate = React.useMemo(() => {
    const map = new Map<string, TestDateMarker[]>();
    for (const marker of testMarkers) {
      const list = map.get(marker.date) ?? [];
      list.push(marker);
      map.set(marker.date, list);
    }
    return map;
  }, [testMarkers]);

  const selectedTestMarkers = testMarkersByDate.get(selectedDate) ?? [];

  const selectedOccurrences = React.useMemo(
    () =>
      projectOccurrences({
        from: selectedDate,
        to: selectedDate,
        slots,
        classes,
        events: projectionEvents,
        includeBlocks: true,
      }),
    [selectedDate, slots, classes, projectionEvents],
  );

  // Lessons that day eligible for attendance - only occurrences with a real
  // class roster behind them (ad_hoc_lesson/trial_lesson/block have no
  // classId; a cancelled lesson didn't happen). Deduped by classId - a class
  // meeting twice the same day shares one attendance_records row per
  // student/date anyway, so a second tab would just edit the same record.
  const attendanceLessons = React.useMemo(() => {
    const byClassId = new Map<string, Occurrence>();
    for (const occurrence of selectedOccurrences) {
      if (
        (occurrence.kind !== "recurring" &&
          occurrence.kind !== "extra_session") ||
        !occurrence.classId
      ) {
        continue;
      }
      if (!byClassId.has(occurrence.classId)) {
        byClassId.set(occurrence.classId, occurrence);
      }
    }
    return [...byClassId.values()];
  }, [selectedOccurrences]);

  const [activeAttendanceClassId, setActiveAttendanceClassId] =
    React.useState<string | null>(null);

  const attendanceStudentOptions = React.useMemo(
    () => students.filter((student) => !student.withdrawnAt),
    [students],
  );

  // Falls back to the day's first lesson whenever the previously-active tab
  // isn't one of today's lessons - e.g. right after switching to a new
  // selected date, or a lesson getting cancelled out from under it.
  const activeAttendanceTab =
    activeAttendanceClassId &&
    attendanceLessons.some(
      (occurrence) => occurrence.classId === activeAttendanceClassId,
    )
      ? activeAttendanceClassId
      : (attendanceLessons[0]?.classId ?? null);

  const todayIso = toIsoDate(new Date());

  const DayButtonWithDots = React.useCallback(
    (dayButtonProps: React.ComponentProps<typeof CalendarDayButton>) => {
      const iso = toIsoDate(dayButtonProps.day.date);
      const kinds = kindsByDate.get(iso);
      const hasTestMarker = (testMarkersByDate.get(iso)?.length ?? 0) > 0;
      return (
        <CalendarDayButton
          {...dayButtonProps}
          className={cn(
            dayButtonProps.className,
            // Independent of the selected-date fill, so today stays
            // visibly marked even when some other date is selected.
            iso === todayIso && "ring-1 ring-inset ring-sky-500",
          )}
        >
          {dayButtonProps.children}
          {(kinds && kinds.size > 0) || hasTestMarker ? (
            <span className="flex gap-0.5">
              {[...(kinds ?? [])].slice(0, 3).map((kind) => (
                <span
                  key={kind}
                  className={cn(
                    "h-1 w-1 rounded-full",
                    KIND_DOT_CLASSES[kind],
                  )}
                />
              ))}
              {hasTestMarker ? (
                <span className={cn("h-1 w-1 rounded-full", TEST_DOT_CLASS)} />
              ) : null}
            </span>
          ) : null}
        </CalendarDayButton>
      );
    },
    [kindsByDate, testMarkersByDate, todayIso],
  );

  const openCreate = (type: AddableEventType) => {
    setForm(blankForm(type, selectedDate));
    setDialog({ mode: "create", type });
  };

  const openEdit = (event: CalendarEvent) => {
    setForm(formFromEvent(event));
    setDialog({ mode: "edit", event });
  };

  const closeDialog = () => {
    setDialog(null);
  };

  const handleCancelOccurrence = async (occurrence: Occurrence) => {
    if (!occurrence.classId) return;
    const key = `${occurrence.classId}|${occurrence.date}|${occurrence.slotTime ?? ""}`;
    setCancellingKey(key);
    try {
      const created = await createCalendarEventAction({
        eventType: "cancellation",
        eventDate: occurrence.date,
        startTime: occurrence.slotTime,
        classId: occurrence.classId,
      });
      onEventsChange((prev) => [...prev, created]);
      toast.success("Class cancelled for this date");
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : "Failed to cancel the class",
      );
    } finally {
      setCancellingKey(null);
    }
  };

  const handleRestore = async (eventId: string) => {
    setDeletingId(eventId);
    try {
      await deleteCalendarEventAction(eventId);
      onEventsChange((prev) => prev.filter((event) => event.id !== eventId));
      toast.success("Class restored");
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : "Failed to restore the class",
      );
    } finally {
      setDeletingId(null);
    }
  };

  const handleDeleteEvent = async (event: CalendarEvent) => {
    if (!window.confirm(`Delete this ${TYPE_LABELS[event.event_type]}?`)) {
      return;
    }
    setDeletingId(event.id);
    try {
      await deleteCalendarEventAction(event.id);
      onEventsChange((prev) => prev.filter((item) => item.id !== event.id));
      toast.success("Deleted");
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : "Failed to delete",
      );
    } finally {
      setDeletingId(null);
    }
  };

  const openReschedule = (occurrence: Occurrence) => {
    setRescheduleTarget(occurrence);
    setRescheduleDate(occurrence.date);
    setRescheduleStartTime(occurrence.startTime ?? "");
    setRescheduleEndTime(occurrence.endTime ?? "");
  };

  const handleReschedule = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!rescheduleTarget) return;
    setIsRescheduling(true);
    try {
      if (rescheduleTarget.kind === "recurring") {
        if (!rescheduleTarget.classId || !rescheduleTarget.slotTime) return;
        const result = await rescheduleClassOccurrenceAction({
          classId: rescheduleTarget.classId,
          fromDate: rescheduleTarget.date,
          fromStartTime: rescheduleTarget.slotTime,
          toDate: rescheduleDate,
          toStartTime: rescheduleStartTime,
          toEndTime: rescheduleEndTime || null,
        });
        onEventsChange((prev) => [
          ...prev,
          result.extraSession,
          result.cancellation,
        ]);
      } else {
        const storedEvent = rescheduleTarget.eventId
          ? events.find((item) => item.id === rescheduleTarget.eventId)
          : undefined;
        if (!storedEvent) return;
        const updated = await updateCalendarEventAction(storedEvent.id, {
          ...formToInput(formFromEvent(storedEvent)),
          eventDate: rescheduleDate,
          startTime: rescheduleStartTime || null,
          endTime: rescheduleEndTime || null,
        });
        onEventsChange((prev) =>
          prev.map((item) => (item.id === updated.id ? updated : item)),
        );
      }
      toast.success("Rescheduled");
      setRescheduleTarget(null);
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : "Failed to reschedule",
      );
    } finally {
      setIsRescheduling(false);
    }
  };

  // A block whose time window covers a scheduled lesson (a whole-day block
  // like a holiday covers every lesson that date; a timed block covers any
  // lesson starting inside it - there's no stored lesson duration to check
  // full overlap against, so "starts inside the block" is the practical
  // approximation) should offer to cancel those lessons rather than leave
  // them silently still bookable.
  const findOccurrencesCoveredByBlock = (
    blockDate: string,
    blockStart: string | null,
    blockEnd: string | null,
  ): Occurrence[] => {
    return projectOccurrences({
      from: blockDate,
      to: blockDate,
      slots,
      classes,
      events: projectionEvents,
      includeBlocks: false,
    }).filter((occurrence) => {
      if (occurrence.kind !== "recurring") return false;
      if (blockStart === null) return true; // whole-day block
      const time = occurrence.startTime ?? "";
      return time >= blockStart && (blockEnd === null || time <= blockEnd);
    });
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!dialog) return;
    setIsSaving(true);
    try {
      const input = formToInput(form);
      if (dialog.mode === "create") {
        let coveredOccurrences: Occurrence[] = [];
        if (input.eventType === "block") {
          coveredOccurrences = findOccurrencesCoveredByBlock(
            input.eventDate,
            input.startTime ?? null,
            input.endTime ?? null,
          );
          if (coveredOccurrences.length > 0) {
            const summary = coveredOccurrences
              .map((o) => `${o.startTime} ${o.className}`)
              .join("\n");
            const proceed = window.confirm(
              `This will also cancel ${coveredOccurrences.length} scheduled lesson${coveredOccurrences.length === 1 ? "" : "s"} that day:\n${summary}\n\nContinue?`,
            );
            if (!proceed) {
              return;
            }
          }
        }

        const created = await createCalendarEventAction(input);
        const createdEvents: CalendarEvent[] = [created];

        let cancelledCount = 0;
        for (const occurrence of coveredOccurrences) {
          if (!occurrence.classId) continue;
          try {
            const cancellation = await createCalendarEventAction({
              eventType: "cancellation",
              eventDate: occurrence.date,
              startTime: occurrence.slotTime,
              classId: occurrence.classId,
            });
            createdEvents.push(cancellation);
            cancelledCount += 1;
          } catch {
            // Best-effort: the block itself and any cancellations that did
            // succeed still stand - the count in the toast below tells the
            // teacher exactly what still needs a manual cancel.
          }
        }

        onEventsChange((prev) => [...prev, ...createdEvents]);
        toast.success(
          coveredOccurrences.length > 0
            ? `${TYPE_LABELS[input.eventType]} added — cancelled ${cancelledCount} of ${coveredOccurrences.length} lessons`
            : `${TYPE_LABELS[input.eventType]} added`,
        );
      } else {
        const updated = await updateCalendarEventAction(
          dialog.event.id,
          input,
        );
        onEventsChange((prev) =>
          prev.map((item) => (item.id === updated.id ? updated : item)),
        );
        toast.success("Updated");
      }
      closeDialog();
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save event",
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4">
    <div className="grid gap-4 lg:grid-cols-[auto_1fr]">
      <Card className="w-fit">
        <CardContent className="p-3">
          <Calendar
            mode="single"
            month={month}
            onMonthChange={setMonth}
            selected={fromIsoDate(selectedDate)}
            onSelect={(date) => date && setSelectedDate(toIsoDate(date))}
            showOutsideDays
            components={{ DayButton: DayButtonWithDots }}
          />
          <div className="mt-2 flex items-center gap-2 border-t pt-2 text-xs">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setMonth((prev) => subMonths(prev, 1))}
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setMonth((prev) => addMonths(prev, 1))}
            >
              Next
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                const today = new Date();
                setMonth(today);
                setSelectedDate(toIsoDate(today));
              }}
            >
              Today
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle>{format(fromIsoDate(selectedDate), "EEEE, d MMMM yyyy")}</CardTitle>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" size="sm">
                <PlusIcon className="mr-1 h-3.5 w-3.5" /> Add
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {ADDABLE_TYPES.map((item) => (
                <DropdownMenuItem
                  key={item.type}
                  onClick={() => openCreate(item.type)}
                >
                  {item.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </CardHeader>
        <CardContent className="space-y-2">
          {selectedOccurrences.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing scheduled.
            </p>
          ) : (
            selectedOccurrences.map((occurrence) => {
              const storedEvent = occurrence.eventId
                ? events.find((event) => event.id === occurrence.eventId)
                : undefined;
              const key = `${occurrence.eventId ?? ""}|${occurrence.classId ?? ""}|${occurrence.slotTime ?? ""}`;
              return (
                <div
                  key={key}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
                >
                  <div
                    className={cn(
                      occurrence.kind === "cancelled" &&
                        "line-through text-muted-foreground",
                    )}
                  >
                    <p className="text-sm font-medium">
                      {occurrence.startTime ?? "All day"}
                      {" · "}
                      {occurrence.className ??
                        occurrence.studentName ??
                        occurrence.contactName ??
                        occurrence.title ??
                        "Untitled"}
                    </p>
                    <div className="mt-1 flex items-center gap-2">
                      <Badge
                        variant={
                          occurrence.kind === "cancelled"
                            ? "destructive"
                            : "outline"
                        }
                      >
                        {occurrence.kind === "recurring"
                          ? "Scheduled class"
                          : occurrence.kind === "cancelled"
                            ? "Cancelled"
                            : TYPE_LABELS[occurrence.kind as CalendarEventType]}
                      </Badge>
                      {occurrence.notes ? (
                        <span className="text-xs text-muted-foreground">
                          {occurrence.notes}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {occurrence.kind === "recurring" && (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => openReschedule(occurrence)}
                        >
                          <CalendarClockIcon className="mr-1 h-3.5 w-3.5" />
                          Reschedule
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={
                            cancellingKey ===
                            `${occurrence.classId}|${occurrence.date}|${occurrence.slotTime ?? ""}`
                          }
                          onClick={() => void handleCancelOccurrence(occurrence)}
                        >
                          Cancel this class
                        </Button>
                      </>
                    )}
                    {occurrence.kind === "cancelled" && occurrence.eventId && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={deletingId === occurrence.eventId}
                        onClick={() => void handleRestore(occurrence.eventId!)}
                      >
                        <UndoIcon className="mr-1 h-3.5 w-3.5" /> Restore
                      </Button>
                    )}
                    {storedEvent && occurrence.kind !== "cancelled" && (
                      <>
                        {occurrence.kind !== "block" && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            aria-label={`Reschedule ${TYPE_LABELS[storedEvent.event_type]}`}
                            onClick={() => openReschedule(occurrence)}
                          >
                            <CalendarClockIcon className="mr-1 h-3.5 w-3.5" />
                            Reschedule
                          </Button>
                        )}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          aria-label={`Edit ${TYPE_LABELS[storedEvent.event_type]}`}
                          onClick={() => openEdit(storedEvent)}
                        >
                          <PencilIcon className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          aria-label={`Delete ${TYPE_LABELS[storedEvent.event_type]}`}
                          disabled={deletingId === storedEvent.id}
                          onClick={() => void handleDeleteEvent(storedEvent)}
                        >
                          <Trash2Icon className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}

          {selectedTestMarkers.length > 0 ? (
            <div className="mt-3 space-y-2 border-t pt-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Tests
              </p>
              {selectedTestMarkers.map((marker) => (
                <div
                  key={marker.testId}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-sm"
                >
                  <span>
                    {marker.label} · {marker.studentCount} student
                    {marker.studentCount === 1 ? "" : "s"}
                  </span>
                  {onViewTest ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => onViewTest(marker.testId)}
                    >
                      View in Tests
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>

    <WeeklyOverview
      selectedDate={selectedDate}
      slots={slots}
      classes={classes}
      events={projectionEvents}
      onSelectDate={setSelectedDate}
    />

    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Attendance — {format(fromIsoDate(selectedDate), "EEEE, d MMMM yyyy")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {attendanceLessons.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing scheduled.</p>
        ) : (
          <Tabs
            value={activeAttendanceTab ?? undefined}
            onValueChange={setActiveAttendanceClassId}
          >
            <TabsList>
              {attendanceLessons.map((occurrence) => (
                <TabsTrigger
                  key={occurrence.classId}
                  value={occurrence.classId!}
                >
                  {occurrence.className}
                  {occurrence.startTime
                    ? ` · ${lessonTimeLabel(occurrence.startTime, occurrence.isTwoHour, occurrence.endTime)}`
                    : ""}
                </TabsTrigger>
              ))}
            </TabsList>
            {attendanceLessons.map((occurrence) => {
              const classId = occurrence.classId!;
              const roster = attendanceStudentOptions.filter((student) =>
                student.assignedClassIds.includes(classId),
              );
              return (
                <TabsContent key={classId} value={classId} className="mt-3">
                  <AttendanceRosterTable
                    roster={roster}
                    classId={classId}
                    className={occurrence.className ?? ""}
                    dateKey={selectedDate}
                    isTwoHour={occurrence.isTwoHour}
                    getStatus={(studentId) =>
                      attendanceRecords.find(
                        (record) =>
                          record.classId === classId &&
                          record.attendanceDate === selectedDate &&
                          record.studentId === studentId,
                      )?.status ?? ""
                    }
                    onOptimisticChange={(studentId, status) =>
                      onAttendanceRecordsChange((prev) =>
                        upsertAttendanceRecord(prev, {
                          classId,
                          className: occurrence.className ?? "",
                          studentId,
                          attendanceDate: selectedDate,
                          status,
                        }),
                      )
                    }
                    onCommitted={() => {}}
                  />
                </TabsContent>
              );
            })}
          </Tabs>
        )}
      </CardContent>
    </Card>

      <Dialog
        open={dialog !== null}
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {dialog?.mode === "edit" ? "Edit" : "Add"}{" "}
              {TYPE_LABELS[form.eventType]}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="event-date">Date</Label>
              <Input
                id="event-date"
                type="date"
                value={form.eventDate}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, eventDate: e.target.value }))
                }
              />
            </div>

            {(form.eventType === "extra_session") && (
              <div className="space-y-2">
                <Label htmlFor="event-class">Class</Label>
                <select
                  id="event-class"
                  value={form.classId}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, classId: e.target.value }))
                  }
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">Choose a class</option>
                  {activeClassOptions.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {form.eventType === "ad_hoc_lesson" && (
              <div className="space-y-2">
                <Label htmlFor="event-student">Student</Label>
                <select
                  id="event-student"
                  value={form.studentId}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, studentId: e.target.value }))
                  }
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">Choose a student</option>
                  {activeStudentOptions.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.firstName} {item.lastName}
                    </option>
                  ))}
                  {withdrawnStudentOptions.length > 0 && (
                    <optgroup label="Withdrawn">
                      {withdrawnStudentOptions.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.firstName} {item.lastName}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>
            )}

            {form.eventType === "trial_lesson" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="event-contact-name">Contact name</Label>
                  <Input
                    id="event-contact-name"
                    value={form.contactName}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        contactName: e.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="event-contact-phone">Phone (optional)</Label>
                  <Input
                    id="event-contact-phone"
                    value={form.contactPhone}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        contactPhone: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>
            )}

            {form.eventType === "block" && (
              <div className="space-y-2">
                <Label htmlFor="event-title">Title</Label>
                <Input
                  id="event-title"
                  value={form.title}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, title: e.target.value }))
                  }
                  placeholder="Dentist, accountant, ..."
                />
              </div>
            )}

            {form.eventType === "block" && (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="event-all-day"
                  checked={form.allDay}
                  onCheckedChange={(checked) =>
                    setForm((prev) => ({ ...prev, allDay: checked === true }))
                  }
                />
                <Label htmlFor="event-all-day" className="font-normal">
                  All day
                </Label>
              </div>
            )}

            {!form.allDay && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="event-start">Start time</Label>
                  <Input
                    id="event-start"
                    type="time"
                    value={form.startTime}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        startTime: e.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="event-end">End time (optional)</Label>
                  <Input
                    id="event-end"
                    type="time"
                    value={form.endTime}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, endTime: e.target.value }))
                    }
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="event-notes">Notes (optional)</Label>
              <Input
                id="event-notes"
                value={form.notes}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, notes: e.target.value }))
                }
              />
            </div>

            <DialogFooter>
              <Button type="submit" disabled={isSaving} className="w-full">
                {isSaving ? "Saving..." : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={rescheduleTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRescheduleTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reschedule</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleReschedule} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="reschedule-date">New date</Label>
              <Input
                id="reschedule-date"
                type="date"
                value={rescheduleDate}
                onChange={(e) => setRescheduleDate(e.target.value)}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="reschedule-start">New start time</Label>
                <Input
                  id="reschedule-start"
                  type="time"
                  value={rescheduleStartTime}
                  onChange={(e) => setRescheduleStartTime(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reschedule-end">New end time (optional)</Label>
                <Input
                  id="reschedule-end"
                  type="time"
                  value={rescheduleEndTime}
                  onChange={(e) => setRescheduleEndTime(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="submit"
                disabled={isRescheduling}
                className="w-full"
              >
                {isRescheduling ? "Rescheduling..." : "Reschedule"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

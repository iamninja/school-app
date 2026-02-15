"use client";

import * as React from "react";
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { format } from "date-fns";
import { CalendarIcon, PlusIcon, XIcon } from "lucide-react";

import {
  createClassAction,
  createStudentAction,
  getAttendanceAction,
  setAttendanceAction,
  setScheduleSlotAction,
} from "@/app/protected/teacher/actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"] as const;
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const TIME_SLOTS = Array.from({ length: 9 }, (_, index) => {
  const hour = 15 + index;
  return `${hour.toString().padStart(2, "0")}:00`;
});
const COLOR_CLASSES = [
  "border-sky-200/70 bg-sky-500/10 text-sky-700",
  "border-emerald-200/70 bg-emerald-500/10 text-emerald-700",
  "border-amber-200/70 bg-amber-500/10 text-amber-700",
  "border-violet-200/70 bg-violet-500/10 text-violet-700",
  "border-rose-200/70 bg-rose-500/10 text-rose-700",
];

type ClassItem = {
  id: string;
  name: string;
  hoursPerWeek: number;
  color: string;
};

type ScheduleState = Record<string, string | null>;

type StudentItem = {
  id: string;
  firstName: string;
  lastName: string;
  gradeLevel: string;
  email: string;
  parentName: string;
  parentEmail: string;
  parentPhone: string;
  parentTwoName?: string;
  parentTwoEmail?: string;
  parentTwoPhone?: string;
  tuitionAmount: string;
  tuitionStatus: "current" | "past-due" | "scholarship";
  assignedClassIds: string[];
};

type AttendanceRecord = {
  studentId: string;
  classId: string;
  attendanceDate: string;
  status: "present" | "late" | "absent";
};

type TeacherDashboardProps = {
  initialClasses: Array<{
    id: string;
    name: string;
    hoursPerWeek: number;
  }>;
  initialSlots: Array<{
    day: string;
    time: string;
    classId: string;
  }>;
  initialStudents: StudentItem[];
  initialAttendance: AttendanceRecord[];
  loadErrors?: string[];
};

function createSlotId(day: string, time: string) {
  return `${day}-${time}`;
}

function parseSlotId(slotId: string) {
  const [day, time] = slotId.split("-");
  return { day, time };
}

function getDayLabelFromDate(date: Date) {
  return DAY_LABELS[date.getDay()] ?? "";
}

function findNextValidDate(start: Date, allowedDays: Set<string>) {
  if (allowedDays.size === 0) {
    return start;
  }
  let date = new Date(start.getTime());
  for (let i = 0; i < 14; i += 1) {
    const label = DAY_LABELS[date.getDay()] ?? "";
    if (allowedDays.has(label)) {
      return date;
    }
    date = new Date(date.getTime() + 24 * 60 * 60 * 1000);
  }
  return start;
}

function DraggableClassChip({
  classItem,
  isCompact = false,
  remaining,
}: {
  classItem: ClassItem;
  isCompact?: boolean;
  remaining?: number;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: `class:${classItem.id}`,
      disabled: typeof remaining === "number" && remaining <= 0,
    });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{ transform: CSS.Transform.toString(transform) }}
      className={
        "inline-flex items-center gap-2 rounded-md border px-3 py-1 text-xs font-semibold shadow-sm transition " +
        classItem.color +
        (isCompact ? " text-[11px]" : "") +
        (isDragging ? " opacity-60" : "") +
        (typeof remaining === "number" && remaining <= 0
          ? " cursor-not-allowed opacity-50"
          : "")
      }
    >
      <span className="truncate">{classItem.name}</span>
      {typeof remaining === "number" ? (
        <span className="text-[10px] uppercase tracking-wide opacity-70">
          {remaining} left
        </span>
      ) : null}
      <span className="text-[10px] uppercase tracking-wide opacity-70">
        Drag
      </span>
    </div>
  );
}

function ScheduledClassCard({
  classItem,
  slotId,
  label,
  onClear,
}: {
  classItem: ClassItem;
  slotId: string;
  label: string;
  onClear: (slotId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: `scheduled:${slotId}`,
      data: {
        sourceSlotId: slotId,
        classId: classItem.id,
      },
    });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{ transform: CSS.Transform.toString(transform) }}
      className={
        "group flex flex-col gap-1 rounded-md border bg-gradient-to-br from-background to-muted/50 p-2 text-left shadow-sm transition " +
        classItem.color +
        (isDragging ? " opacity-60" : "")
      }
    >
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm font-semibold text-foreground">
          {classItem.name}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => onClear(slotId)}
          aria-label="Clear slot"
        >
          <XIcon className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="text-[11px] text-muted-foreground">
        {label} • {classItem.hoursPerWeek} hrs/week
      </div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground/80">
        Drag to reschedule
      </div>
    </div>
  );
}

function ScheduleCell({
  slotId,
  classItem,
  label,
  onClear,
}: {
  slotId: string;
  classItem?: ClassItem;
  label: string;
  onClear: (slotId: string) => void;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: `slot:${slotId}`,
  });

  return (
    <div
      ref={setNodeRef}
      className={
        "min-h-[64px] border-l border-dashed p-2 transition " +
        (isOver ? "bg-muted/60" : "bg-background")
      }
    >
      {classItem ? (
        <ScheduledClassCard
          classItem={classItem}
          slotId={slotId}
          label={label}
          onClear={onClear}
        />
      ) : (
        <div className="text-[11px] text-muted-foreground">Drop class here</div>
      )}
    </div>
  );
}

export function TeacherDashboard({
  initialClasses,
  initialSlots,
  initialStudents,
  initialAttendance,
  loadErrors = [],
}: TeacherDashboardProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );
  const [className, setClassName] = React.useState("");
  const [hoursPerWeek, setHoursPerWeek] = React.useState("2");
  const [classes, setClasses] = React.useState<ClassItem[]>(() =>
    initialClasses.map((item, index) => ({
      ...item,
      color: COLOR_CLASSES[index % COLOR_CLASSES.length],
    }))
  );
  const [schedule, setSchedule] = React.useState<ScheduleState>(() => {
    const initial: ScheduleState = {};
    DAYS.forEach((day) => {
      TIME_SLOTS.forEach((time) => {
        initial[createSlotId(day, time)] = null;
      });
    });
    initialSlots.forEach((slot) => {
      const slotId = createSlotId(slot.day, slot.time);
      initial[slotId] = slot.classId;
    });
    return initial;
  });
  const [studentForm, setStudentForm] = React.useState({
    firstName: "",
    lastName: "",
    gradeLevel: "",
    email: "",
    parentName: "",
    parentEmail: "",
    parentPhone: "",
    parentTwoName: "",
    parentTwoEmail: "",
    parentTwoPhone: "",
    tuitionAmount: "",
    tuitionStatus: "current" as StudentItem["tuitionStatus"],
    assignedClassIds: [] as string[],
  });
  const [students, setStudents] = React.useState<StudentItem[]>(
    initialStudents
  );
  const [showSecondParent, setShowSecondParent] = React.useState(false);
  const [selectedStudentId, setSelectedStudentId] = React.useState<string | null>(
    null
  );
  const [attendanceDate, setAttendanceDate] = React.useState(() => new Date());
  const [attendanceClassId, setAttendanceClassId] = React.useState<string>("");
  const [attendanceStatusByStudent, setAttendanceStatusByStudent] =
    React.useState<Record<string, "present" | "late" | "absent" | "">>({});
  const [attendanceDateError, setAttendanceDateError] = React.useState("");
  const [attendanceRecords, setAttendanceRecords] = React.useState<
    AttendanceRecord[]
  >(initialAttendance);

  const scheduledCounts = React.useMemo(() => {
    const counts = new Map<string, number>();
    Object.values(schedule).forEach((value) => {
      if (!value) {
        return;
      }
      counts.set(value, (counts.get(value) ?? 0) + 1);
    });
    return counts;
  }, [schedule]);

  const remainingById = React.useMemo(() => {
    const remaining = new Map<string, number>();
    classes.forEach((item) => {
      const used = scheduledCounts.get(item.id) ?? 0;
      remaining.set(item.id, Math.max(item.hoursPerWeek - used, 0));
    });
    return remaining;
  }, [classes, scheduledCounts]);

  const handleAddClass = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = className.trim();
    const hours = Number.parseInt(hoursPerWeek, 10);
    if (!trimmed) {
      return;
    }
    if (Number.isNaN(hours) || hours < 1) {
      return;
    }
    const nextColor = COLOR_CLASSES[classes.length % COLOR_CLASSES.length];
    const created = await createClassAction({
      name: trimmed,
      hoursPerWeek: hours,
    });
    setClasses((prev) => [
      ...prev,
      {
        id: created.id,
        name: created.name,
        hoursPerWeek: created.hoursPerWeek,
        color: nextColor,
      },
    ]);
    setClassName("");
    setHoursPerWeek("2");
  };

  const handleClearSlot = async (slotId: string) => {
    const { day, time } = parseSlotId(slotId);
    await setScheduleSlotAction({ day, time, classId: null });
    setSchedule((prev) => ({ ...prev, [slotId]: null }));
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) {
      return;
    }
    const overId = String(over.id);
    if (!overId.startsWith("slot:")) {
      return;
    }
    const slotId = overId.replace("slot:", "");
    const activeId = String(active.id);
    const activeData = active.data.current as {
      sourceSlotId?: string;
      classId?: string;
    };
    const sourceSlotId = activeData?.sourceSlotId;
    const classId = activeId.startsWith("class:")
      ? activeId.replace("class:", "")
      : activeData?.classId;
    const classItem = classes.find((item) => item.id === classId);

    if (!classItem) {
      return;
    }

    if (!sourceSlotId) {
      const remaining = remainingById.get(classItem.id) ?? 0;
      if (remaining <= 0) {
        return;
      }
    } else if (sourceSlotId === slotId) {
      return;
    }

    const { day, time } = parseSlotId(slotId);
    if (sourceSlotId) {
      const source = parseSlotId(sourceSlotId);
      await Promise.all([
        setScheduleSlotAction({
          day: source.day,
          time: source.time,
          classId: null,
        }),
        setScheduleSlotAction({ day, time, classId: classItem.id }),
      ]);
    } else {
      await setScheduleSlotAction({ day, time, classId: classItem.id });
    }

    setSchedule((prev) => {
      const next = { ...prev };
      if (sourceSlotId) {
        next[sourceSlotId] = null;
      }
      next[slotId] = classItem.id;
      return next;
    });
  };

  const handleStudentChange = (
    key: keyof typeof studentForm,
    value: string | string[]
  ) => {
    setStudentForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleToggleStudentClass = (classId: string) => {
    setStudentForm((prev) => ({
      ...prev,
      assignedClassIds: prev.assignedClassIds.includes(classId)
        ? prev.assignedClassIds.filter((id) => id !== classId)
        : [...prev.assignedClassIds, classId],
    }));
  };

  const handleAddStudent = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();
    if (!studentForm.firstName.trim() || !studentForm.lastName.trim()) {
      return;
    }
    const created = await createStudentAction({
      firstName: studentForm.firstName.trim(),
      lastName: studentForm.lastName.trim(),
      gradeLevel: studentForm.gradeLevel.trim(),
      email: studentForm.email.trim(),
      parentName: studentForm.parentName.trim(),
      parentEmail: studentForm.parentEmail.trim(),
      parentPhone: studentForm.parentPhone.trim(),
      parentTwoName: studentForm.parentTwoName.trim(),
      parentTwoEmail: studentForm.parentTwoEmail.trim(),
      parentTwoPhone: studentForm.parentTwoPhone.trim(),
      tuitionAmount: studentForm.tuitionAmount.trim(),
      tuitionStatus: studentForm.tuitionStatus,
      assignedClassIds: studentForm.assignedClassIds,
    });
    setStudents((prev) => [created, ...prev]);
    setStudentForm({
      firstName: "",
      lastName: "",
      gradeLevel: "",
      email: "",
      parentName: "",
      parentEmail: "",
      parentPhone: "",
      parentTwoName: "",
      parentTwoEmail: "",
      parentTwoPhone: "",
      tuitionAmount: "",
      tuitionStatus: "current",
      assignedClassIds: [],
    });
    setShowSecondParent(false);
  };

  const attendanceRoster = React.useMemo(() => {
    if (!attendanceClassId) {
      return [];
    }
    return students.filter((student) =>
      student.assignedClassIds.includes(attendanceClassId)
    );
  }, [attendanceClassId, students]);

  const attendanceAllowedDays = React.useMemo(() => {
    if (!attendanceClassId) {
      return new Set<string>();
    }
    const allowed = new Set<string>();
    Object.entries(schedule).forEach(([slotId, classId]) => {
      if (classId !== attendanceClassId) {
        return;
      }
      const { day } = parseSlotId(slotId);
      allowed.add(day);
    });
    return allowed;
  }, [attendanceClassId, schedule]);

  const attendanceDateKey = React.useMemo(() => {
    return format(attendanceDate, "yyyy-MM-dd");
  }, [attendanceDate]);

  const updateAttendanceRecords = React.useCallback(
    (studentId: string, status: "present" | "late" | "absent" | "") => {
      setAttendanceRecords((prev) => {
        const next = prev.filter(
          (record) =>
            !(
              record.studentId === studentId &&
              record.classId === attendanceClassId &&
              record.attendanceDate === attendanceDateKey
            )
        );
        if (status) {
          next.unshift({
            studentId,
            classId: attendanceClassId,
            attendanceDate: attendanceDateKey,
            status,
          });
        }
        return next;
      });
    },
    [attendanceClassId, attendanceDateKey]
  );

  React.useEffect(() => {
    let isActive = true;

    const loadAttendance = async () => {
      if (!attendanceClassId) {
        setAttendanceStatusByStudent({});
        return;
      }
      try {
        const rows = await getAttendanceAction({
          classId: attendanceClassId,
          attendanceDate: attendanceDateKey,
        });
        if (!isActive) {
          return;
        }
        const next: Record<string, "present" | "late" | "absent" | ""> = {};
        rows.forEach((row) => {
          next[row.student_id] = row.status;
        });
        setAttendanceStatusByStudent(next);
      } catch {
        if (isActive) {
          setAttendanceStatusByStudent({});
        }
      }
    };

    void loadAttendance();

    return () => {
      isActive = false;
    };
  }, [attendanceClassId, attendanceDateKey]);

  const handleAttendanceDateChange = (value?: Date) => {
    if (!value) {
      return;
    }
    if (!attendanceClassId) {
      setAttendanceDate(value);
      setAttendanceDateError("");
      setAttendanceStatusByStudent({});
      return;
    }

    if (attendanceAllowedDays.size === 0) {
      setAttendanceDateError("This class has no scheduled days yet.");
      return;
    }

    const dayLabel = getDayLabelFromDate(value);
    if (!attendanceAllowedDays.has(dayLabel)) {
      setAttendanceDateError(
        "Pick a date that matches a scheduled class day."
      );
      return;
    }

    setAttendanceDate(value);
    setAttendanceDateError("");
    setAttendanceStatusByStudent({});
  };

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CalendarIcon className="h-4 w-4" />
            Teacher dashboard
          </div>
          <h1 className="text-2xl font-semibold">
            Plan classes and weekly schedule
          </h1>
          <p className="text-sm text-muted-foreground">
            Create classes, then drag them into the weekly calendar to build a
            schedule.
          </p>
        </div>
      </div>

      {loadErrors.length > 0 ? (
        <Alert>
          <AlertTitle>Supabase load error</AlertTitle>
          <AlertDescription>
            <div className="space-y-2">
              <p className="text-sm">
                We could not fetch your data. Check the schema and RLS policies,
                then reload.
              </p>
              <ul className="list-disc space-y-1 pl-4 text-xs">
                {loadErrors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            </div>
          </AlertDescription>
        </Alert>
      ) : null}

      <Tabs defaultValue="schedule" className="w-full">
        <TabsList>
          <TabsTrigger value="schedule">Schedule</TabsTrigger>
          <TabsTrigger value="students">Students</TabsTrigger>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
        </TabsList>

        <TabsContent value="schedule" className="mt-6">
          <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
            <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
              <Card className="order-1">
                <CardHeader>
                  <CardTitle>Create class</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <form className="space-y-3" onSubmit={handleAddClass}>
                    <div className="space-y-2">
                      <Label htmlFor="class-name">Class name</Label>
                      <Input
                        id="class-name"
                        value={className}
                        onChange={(event) => setClassName(event.target.value)}
                        placeholder="e.g. Algebra II"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="hours-per-week">Hours per week</Label>
                      <Input
                        id="hours-per-week"
                        type="number"
                        min={1}
                        max={40}
                        value={hoursPerWeek}
                        onChange={(event) => setHoursPerWeek(event.target.value)}
                        placeholder="e.g. 3"
                      />
                    </div>
                    <Button type="submit" className="w-full">
                      <PlusIcon className="mr-2 h-4 w-4" />
                      Add class
                    </Button>
                  </form>

                  <div className="space-y-3">
                    <div className="text-sm font-medium">Unscheduled classes</div>
                    <div className="flex flex-wrap gap-2">
                      {classes.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          All classes are scheduled. Add more above.
                        </p>
                      ) : (
                        classes.map((item) => (
                          <DraggableClassChip
                            key={item.id}
                            classItem={item}
                            remaining={remainingById.get(item.id) ?? 0}
                          />
                        ))
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Remaining slots follow each class based on hours per week.
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card className="order-2">
                <CardHeader>
                  <CardTitle>Weekly schedule</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-hidden rounded-lg border">
                    <div className="grid grid-cols-[120px_repeat(5,minmax(0,1fr))] border-b bg-muted/40 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      <div className="px-3 py-2">Time</div>
                      {DAYS.map((day) => (
                        <div key={day} className="px-3 py-2">
                          {day}
                        </div>
                      ))}
                    </div>

                    {TIME_SLOTS.map((time) => (
                      <div
                        key={time}
                        className="grid grid-cols-[120px_repeat(5,minmax(0,1fr))] border-b last:border-b-0"
                      >
                        <div className="px-3 py-4 text-xs font-medium text-muted-foreground">
                          {time}
                        </div>
                        {DAYS.map((day) => {
                          const slotId = createSlotId(day, time);
                          const classId = schedule[slotId] ?? null;
                          const classItem = classes.find(
                            (item) => item.id === classId
                          );
                          const label = `${day} ${time}`;

                          return (
                            <ScheduleCell
                              key={slotId}
                              slotId={slotId}
                              classItem={classItem}
                              label={label}
                              onClear={handleClearSlot}
                            />
                          );
                        })}
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    Drag classes into the schedule. This is a UI prototype and
                    resets on refresh.
                  </p>
                </CardContent>
              </Card>
            </div>
          </DndContext>
        </TabsContent>

        <TabsContent value="students" className="mt-6">
          {selectedStudentId ? (
            <div className="animate-in fade-in slide-in-from-right-8 duration-300">
              {(() => {
                const student = students.find(
                  (item) => item.id === selectedStudentId
                );
                if (!student) {
                  return null;
                }
                return (
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between gap-4">
                      <div>
                        <CardTitle>
                          {student.firstName} {student.lastName}
                        </CardTitle>
                        <div className="text-sm text-muted-foreground">
                          Grade {student.gradeLevel || "N/A"} • {student.email || "No email"}
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        onClick={() => setSelectedStudentId(null)}
                      >
                        Back to students
                      </Button>
                    </CardHeader>
                    <CardContent className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
                      <div className="space-y-4">
                        <div className="rounded-lg border p-4">
                          <div className="text-xs uppercase tracking-wide text-muted-foreground">
                            Parents
                          </div>
                          <div className="mt-3 space-y-3">
                            <div>
                              <div className="text-sm font-medium">
                                {student.parentName || "Not set"}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {student.parentEmail || "No email"} • {student.parentPhone || "No phone"}
                              </div>
                            </div>
                            {student.parentTwoName ||
                            student.parentTwoEmail ||
                            student.parentTwoPhone ? (
                              <div>
                                <div className="text-sm font-medium">
                                  {student.parentTwoName || "Second parent"}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {student.parentTwoEmail || "No email"} • {student.parentTwoPhone || "No phone"}
                                </div>
                              </div>
                            ) : null}
                          </div>
                        </div>

                        <div className="rounded-lg border p-4">
                          <div className="text-xs uppercase tracking-wide text-muted-foreground">
                            Tuition
                          </div>
                          <div className="mt-3 text-sm font-medium">
                            {student.tuitionAmount
                              ? `$${student.tuitionAmount}`
                              : "No amount"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Status: {student.tuitionStatus.replace("-", " ")}
                          </div>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="rounded-lg border p-4">
                          <div className="text-xs uppercase tracking-wide text-muted-foreground">
                            Assigned classes
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {student.assignedClassIds.length === 0 ? (
                              <span className="text-xs text-muted-foreground">
                                No assigned classes
                              </span>
                            ) : (
                              student.assignedClassIds.map((classId) => {
                                const className =
                                  classes.find((item) => item.id === classId)
                                    ?.name ?? "Unknown class";
                                return (
                                  <Badge key={classId} variant="outline">
                                    {className}
                                  </Badge>
                                );
                              })
                            )}
                          </div>
                        </div>

                        <div className="rounded-lg border p-4">
                          <div className="text-xs uppercase tracking-wide text-muted-foreground">
                            Tuition status
                          </div>
                          <div className="mt-3">
                            <Badge variant="secondary">
                              {student.tuitionStatus.replace("-", " ")}
                            </Badge>
                          </div>
                        </div>

                        <div className="rounded-lg border p-4">
                          <div className="text-xs uppercase tracking-wide text-muted-foreground">
                            Attendance
                          </div>
                          <div className="mt-3 space-y-2 text-xs">
                            {attendanceRecords.filter(
                              (record) => record.studentId === student.id
                            ).length === 0 ? (
                              <div className="text-muted-foreground">
                                No attendance records yet.
                              </div>
                            ) : (
                              <div className="divide-y rounded-md border">
                                {attendanceRecords
                                  .filter(
                                    (record) =>
                                      record.studentId === student.id
                                  )
                                  .slice(0, 10)
                                  .map((record) => {
                                    const className =
                                      classes.find(
                                        (item) => item.id === record.classId
                                      )?.name ?? "Unknown class";
                                    return (
                                      <div
                                        key={`${record.studentId}-${record.classId}-${record.attendanceDate}`}
                                        className="flex items-center justify-between px-3 py-2"
                                      >
                                        <div>
                                          <div className="font-medium">
                                            {className}
                                          </div>
                                          <div className="text-muted-foreground">
                                            {record.attendanceDate}
                                          </div>
                                        </div>
                                        <Badge variant="outline">
                                          {record.status}
                                        </Badge>
                                      </div>
                                    );
                                  })}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })()}
            </div>
          ) : (
            <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
              <Card className="order-1">
                <CardHeader>
                  <CardTitle>Create student</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <form className="space-y-4" onSubmit={handleAddStudent}>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="student-first-name">First name</Label>
                        <Input
                          id="student-first-name"
                          value={studentForm.firstName}
                          onChange={(event) =>
                            handleStudentChange("firstName", event.target.value)
                          }
                          placeholder="e.g. Maya"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="student-last-name">Last name</Label>
                        <Input
                          id="student-last-name"
                          value={studentForm.lastName}
                          onChange={(event) =>
                            handleStudentChange("lastName", event.target.value)
                          }
                          placeholder="e.g. Carter"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="student-grade">Grade</Label>
                        <select
                          id="student-grade"
                          value={studentForm.gradeLevel}
                          onChange={(event) =>
                            handleStudentChange("gradeLevel", event.target.value)
                          }
                          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                        >
                          <option value="">Select grade</option>
                          <option value="7">7th grade</option>
                          <option value="8">8th grade</option>
                          <option value="9">9th grade</option>
                          <option value="10">10th grade</option>
                          <option value="11">11th grade</option>
                          <option value="12">12th grade</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="student-email">Email</Label>
                        <Input
                          id="student-email"
                          type="email"
                          value={studentForm.email}
                          onChange={(event) =>
                            handleStudentChange("email", event.target.value)
                          }
                          placeholder="student@email.com"
                        />
                      </div>
                    </div>

                    <div className="rounded-lg border p-4">
                      <div className="text-sm font-medium">Parent contact</div>
                      <div className="mt-3 grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="parent-name">Parent name</Label>
                          <Input
                            id="parent-name"
                            value={studentForm.parentName}
                            onChange={(event) =>
                              handleStudentChange("parentName", event.target.value)
                            }
                            placeholder="e.g. Jordan Carter"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="parent-email">Parent email</Label>
                          <Input
                            id="parent-email"
                            type="email"
                            value={studentForm.parentEmail}
                            onChange={(event) =>
                              handleStudentChange(
                                "parentEmail",
                                event.target.value
                              )
                            }
                            placeholder="parent@email.com"
                          />
                        </div>
                        <div className="space-y-2 sm:col-span-2">
                          <Label htmlFor="parent-phone">Parent phone</Label>
                          <Input
                            id="parent-phone"
                            value={studentForm.parentPhone}
                            onChange={(event) =>
                              handleStudentChange(
                                "parentPhone",
                                event.target.value
                              )
                            }
                            placeholder="(555) 654-1234"
                          />
                        </div>
                      </div>
                      {showSecondParent ? (
                        <div className="mt-4 border-t pt-4">
                          <div className="text-sm font-medium">
                            Second parent
                          </div>
                          <div className="mt-3 grid gap-4 sm:grid-cols-2">
                            <div className="space-y-2">
                              <Label htmlFor="parent-two-name">Name</Label>
                              <Input
                                id="parent-two-name"
                                value={studentForm.parentTwoName}
                                onChange={(event) =>
                                  handleStudentChange(
                                    "parentTwoName",
                                    event.target.value
                                  )
                                }
                                placeholder="e.g. Jamie Carter"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="parent-two-email">Email</Label>
                              <Input
                                id="parent-two-email"
                                type="email"
                                value={studentForm.parentTwoEmail}
                                onChange={(event) =>
                                  handleStudentChange(
                                    "parentTwoEmail",
                                    event.target.value
                                  )
                                }
                                placeholder="parent2@email.com"
                              />
                            </div>
                            <div className="space-y-2 sm:col-span-2">
                              <Label htmlFor="parent-two-phone">Phone</Label>
                              <Input
                                id="parent-two-phone"
                                value={studentForm.parentTwoPhone}
                                onChange={(event) =>
                                  handleStudentChange(
                                    "parentTwoPhone",
                                    event.target.value
                                  )
                                }
                                placeholder="(555) 777-1212"
                              />
                            </div>
                          </div>
                        </div>
                      ) : null}
                      <Button
                        type="button"
                        variant="outline"
                        className="mt-4"
                        onClick={() => setShowSecondParent((prev) => !prev)}
                      >
                        {showSecondParent ? "Remove" : "Add"} second parent
                      </Button>
                    </div>

                    <div className="rounded-lg border p-4">
                      <div className="text-sm font-medium">Tuition</div>
                      <div className="mt-3 grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="tuition-amount">Amount</Label>
                          <Input
                            id="tuition-amount"
                            type="number"
                            min={0}
                            value={studentForm.tuitionAmount}
                            onChange={(event) =>
                              handleStudentChange(
                                "tuitionAmount",
                                event.target.value
                              )
                            }
                            placeholder="e.g. 420"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="tuition-status">Status</Label>
                          <select
                            id="tuition-status"
                            value={studentForm.tuitionStatus}
                            onChange={(event) =>
                              handleStudentChange(
                                "tuitionStatus",
                                event.target.value
                              )
                            }
                            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                          >
                            <option value="current">Current</option>
                            <option value="past-due">Past due</option>
                            <option value="scholarship">Scholarship</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="text-sm font-medium">Assigned classes</div>
                      <div className="grid gap-3">
                        {classes.length === 0 ? (
                          <p className="text-xs text-muted-foreground">
                            Create classes in the Schedule tab first.
                          </p>
                        ) : (
                          classes.map((classItem) => (
                            <label
                              key={classItem.id}
                              className="flex items-center gap-3 rounded-md border p-3 text-sm"
                            >
                              <Checkbox
                                checked={studentForm.assignedClassIds.includes(
                                  classItem.id
                                )}
                                onCheckedChange={() =>
                                  handleToggleStudentClass(classItem.id)
                                }
                              />
                              <span className="flex-1">{classItem.name}</span>
                            </label>
                          ))
                        )}
                      </div>
                    </div>

                    <Button type="submit" className="w-full">
                      Create student
                    </Button>
                  </form>
                </CardContent>
              </Card>

              <Card className="order-2">
                <CardHeader>
                  <CardTitle>Students</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {students.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No students yet. Add one on the left.
                    </p>
                  ) : (
                    students.map((student) => (
                      <div
                        key={student.id}
                        className="cursor-pointer rounded-lg border p-4 transition hover:border-foreground/40"
                        onClick={() => setSelectedStudentId(student.id)}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold">
                              {student.firstName} {student.lastName}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Grade {student.gradeLevel || "N/A"} • {student.email || "No email"}
                            </div>
                          </div>
                          <Badge variant="secondary">
                            {student.tuitionStatus.replace("-", " ")}
                          </Badge>
                        </div>
                        <div className="mt-3 text-xs text-muted-foreground">
                          Parent: {student.parentName || "Not set"} • {student.parentPhone || "No phone"}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {student.assignedClassIds.length === 0 ? (
                            <span className="text-xs text-muted-foreground">
                              No assigned classes
                            </span>
                          ) : (
                            student.assignedClassIds.map((classId) => {
                              const className =
                                classes.find((item) => item.id === classId)
                                  ?.name ?? "Unknown class";
                              return (
                                <Badge key={classId} variant="outline">
                                  {className}
                                </Badge>
                              );
                            })
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="attendance" className="mt-6">
          <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
            <Card className="order-1">
              <CardHeader>
                <CardTitle>Attendance setup</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="attendance-date">Date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        id="attendance-date"
                        variant="outline"
                        className="w-full justify-start text-left"
                      >
                        {attendanceDate
                          ? format(attendanceDate, "PPP")
                          : "Pick a date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={attendanceDate}
                        onSelect={handleAttendanceDateChange}
                        disabled={(date) => {
                          if (!attendanceClassId) {
                            return true;
                          }
                          if (attendanceAllowedDays.size === 0) {
                            return true;
                          }
                          const label = getDayLabelFromDate(date);
                          return !attendanceAllowedDays.has(label);
                        }}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  {attendanceDateError ? (
                    <p className="text-xs text-destructive">
                      {attendanceDateError}
                    </p>
                  ) : null}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="attendance-class">Class</Label>
                  <select
                    id="attendance-class"
                    value={attendanceClassId}
                    onChange={(event) => {
                      const nextClassId = event.target.value;
                      setAttendanceClassId(nextClassId);
                      setAttendanceStatusByStudent({});
                      if (!nextClassId) {
                        setAttendanceDateError("");
                        return;
                      }
                      const allowed = new Set<string>();
                      Object.entries(schedule).forEach(([slotId, classId]) => {
                        if (classId !== nextClassId) {
                          return;
                        }
                        const { day } = parseSlotId(slotId);
                        allowed.add(day);
                      });
                      if (allowed.size === 0) {
                        setAttendanceDateError(
                          "This class has no scheduled days yet."
                        );
                        return;
                      }
                      const currentDay = getDayLabelFromDate(attendanceDate);
                      if (!allowed.has(currentDay)) {
                        const nextDate = findNextValidDate(attendanceDate, allowed);
                        setAttendanceDate(nextDate);
                        setAttendanceDateError("");
                      }
                    }}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="">All students</option>
                    {classes.map((classItem) => (
                      <option key={classItem.id} value={classItem.id}>
                        {classItem.name}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="text-xs text-muted-foreground">
                  Pick a class to filter the roster for attendance tracking.
                </p>
              </CardContent>
            </Card>

            <Card className="order-2">
              <CardHeader>
                <CardTitle>Attendance roster</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {!attendanceClassId ? (
                  <p className="text-sm text-muted-foreground">
                    Select a class to view its assigned students.
                  </p>
                ) : attendanceRoster.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No students assigned to this class yet.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {attendanceRoster.map((student) => {
                      const status =
                        attendanceStatusByStudent[student.id] ?? "";

                      return (
                        <div
                          key={student.id}
                          className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div>
                            <div className="text-sm font-semibold">
                              {student.firstName} {student.lastName}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Grade {student.gradeLevel || "N/A"} • {student.email || "No email"}
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              variant={status === "present" ? "default" : "outline"}
                              size="sm"
                              onClick={async () => {
                                if (!attendanceClassId) {
                                  return;
                                }
                                const nextStatus =
                                  status === "present" ? "" : "present";
                                setAttendanceStatusByStudent((prev) => ({
                                  ...prev,
                                  [student.id]: nextStatus,
                                }));
                                await setAttendanceAction({
                                  classId: attendanceClassId,
                                  studentId: student.id,
                                  attendanceDate: attendanceDateKey,
                                  status: nextStatus,
                                });
                                updateAttendanceRecords(
                                  student.id,
                                  nextStatus as "present" | "late" | "absent" | ""
                                );
                              }}
                            >
                              Present
                            </Button>
                            <Button
                              type="button"
                              variant={status === "late" ? "default" : "outline"}
                              size="sm"
                              onClick={async () => {
                                if (!attendanceClassId) {
                                  return;
                                }
                                const nextStatus = status === "late" ? "" : "late";
                                setAttendanceStatusByStudent((prev) => ({
                                  ...prev,
                                  [student.id]: nextStatus,
                                }));
                                await setAttendanceAction({
                                  classId: attendanceClassId,
                                  studentId: student.id,
                                  attendanceDate: attendanceDateKey,
                                  status: nextStatus,
                                });
                                updateAttendanceRecords(
                                  student.id,
                                  nextStatus as "present" | "late" | "absent" | ""
                                );
                              }}
                            >
                              Late
                            </Button>
                            <Button
                              type="button"
                              variant={status === "absent" ? "destructive" : "outline"}
                              size="sm"
                              onClick={async () => {
                                if (!attendanceClassId) {
                                  return;
                                }
                                const nextStatus =
                                  status === "absent" ? "" : "absent";
                                setAttendanceStatusByStudent((prev) => ({
                                  ...prev,
                                  [student.id]: nextStatus,
                                }));
                                await setAttendanceAction({
                                  classId: attendanceClassId,
                                  studentId: student.id,
                                  attendanceDate: attendanceDateKey,
                                  status: nextStatus,
                                });
                                updateAttendanceRecords(
                                  student.id,
                                  nextStatus as "present" | "late" | "absent" | ""
                                );
                              }}
                            >
                              Absent
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className="text-xs text-muted-foreground">
                  Attendance is saved automatically for this class and date.
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

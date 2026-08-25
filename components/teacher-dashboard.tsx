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
import {
  ArchiveIcon,
  Building2Icon,
  CalendarDaysIcon,
  CalendarRangeIcon,
  ClipboardCheckIcon,
  EuroIcon,
  FileTextIcon,
  LayersIcon,
  PencilIcon,
  PlusIcon,
  ReceiptTextIcon,
  RotateCcwIcon,
  SearchIcon,
  Trash2Icon,
  UsersIcon,
  WalletIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";

import {
  archiveClassAction,
  createClassAction,
  createStudentAction,
  deleteClassAction,
  enrollStudentInClassAction,
  getAttendanceAction,
  restoreClassAction,
  restoreStudentAction,
  setAttendanceAction,
  setScheduleSlotAction,
  unenrollStudentFromClassAction,
  updateClassAction,
  updateStudentAction,
  withdrawStudentAction,
} from "@/app/protected/teacher/actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LogoutButton } from "@/components/logout-button";
import { TeacherClassDetail } from "@/components/teacher-class-detail";
import { TeacherQuizBuilder } from "@/components/teacher-quiz-builder";
import {
  TeacherBusinessSettings,
  type CredentialStatusView,
} from "@/components/teacher-business-settings";
import { TeacherReceipts } from "@/components/teacher-receipts";
import { TeacherExpenses } from "@/components/teacher-expenses";
import { TeacherBilling } from "@/components/teacher-billing";
import { TeacherCalendar } from "@/components/teacher-calendar";
import { ThemeSwitcher } from "@/components/theme-switcher";
import {
  buildAttendanceDateSets,
  findNextEnabledDate,
  isDateEnabledForAttendance,
} from "@/lib/attendance-dates";
import { SCHEDULE_ROWS } from "@/lib/schedule-grid";
import { CLASS_GRADES, CLASS_GRADE_LABELS } from "@/lib/class-grades";
import { formatEuro } from "@/lib/format-currency";
import {
  deriveTuitionStatus,
  TUITION_STATUS_LABELS_EN,
} from "@/lib/billing/tuition-status";
import type {
  BusinessProfile,
  CalendarEvent,
  ChargeRun,
  Expense,
  FamilyBalanceSummary,
  IntegrationSettings,
  Receipt,
  TeacherQuizListItem,
} from "@/lib/types/database";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const SECTIONS = [
  {
    value: "schedule",
    label: "Schedule",
    description: "Drag classes onto the weekly grid",
    icon: CalendarDaysIcon,
  },
  {
    value: "calendar",
    label: "Calendar",
    description: "Cancellations, extra sessions, and one-off lessons",
    icon: CalendarRangeIcon,
  },
  {
    value: "classes",
    label: "Classes",
    description: "Create, edit, and archive classes",
    icon: LayersIcon,
  },
  {
    value: "students",
    label: "Students",
    description: "Roster, families, and tuition",
    icon: UsersIcon,
  },
  {
    value: "attendance",
    label: "Attendance",
    description: "Mark presence per class and date",
    icon: ClipboardCheckIcon,
  },
  {
    value: "quizzes",
    label: "Quizzes",
    description: "Build and assign quizzes",
    icon: FileTextIcon,
  },
  {
    value: "billing",
    label: "Billing",
    description: "Family balances, payments, and monthly charges",
    icon: EuroIcon,
  },
  {
    value: "receipts",
    label: "Receipts",
    description: "Issue and print receipts",
    icon: ReceiptTextIcon,
  },
  {
    value: "expenses",
    label: "Expenses",
    description: "Log business expenses",
    icon: WalletIcon,
  },
  {
    value: "business",
    label: "Business",
    description: "Tax details and integrations",
    icon: Building2Icon,
  },
] as const;

const COLOR_CLASSES = [
  "border-amber-500/30 bg-amber-400/15 text-amber-800 dark:text-amber-300",
  "border-teal-500/30 bg-teal-500/10 text-teal-800 dark:text-teal-300",
  "border-violet-500/30 bg-violet-500/10 text-violet-800 dark:text-violet-300",
  "border-rose-500/30 bg-rose-500/10 text-rose-800 dark:text-rose-300",
  "border-sky-500/30 bg-sky-500/10 text-sky-800 dark:text-sky-300",
];

type ClassItem = {
  id: string;
  name: string;
  hoursPerWeek: number;
  grade: string | null;
  color: string;
  archivedAt: string | null;
};

type ScheduleState = Record<string, string | null>;

type StudentItem = {
  id: string;
  firstName: string;
  lastName: string;
  gradeLevel: string;
  email: string;
  familyId?: string;
  withdrawnAt?: string | null;
  parentName: string;
  parentEmail: string;
  parentPhone: string;
  parentTwoName?: string;
  parentTwoEmail?: string;
  parentTwoPhone?: string;
  tuitionAmount: string;
  assignedClassIds: string[];
};

type FamilyItem = {
  id: string;
  parentNames: string[];
  parentEmails: string[];
  studentNames: string[];
};

type AttendanceRecord = {
  studentId: string;
  classId: string | null;
  className: string;
  attendanceDate: string;
  status: "present" | "late" | "absent";
};

type TeacherDashboardProps = {
  initialClasses: Array<{
    id: string;
    name: string;
    hoursPerWeek: number;
    grade?: string | null;
    archivedAt: string | null;
  }>;
  initialSlots: Array<{
    day: string;
    time: string;
    classId: string;
  }>;
  initialStudents: StudentItem[];
  initialFamilies?: FamilyItem[];
  initialAttendance: AttendanceRecord[];
  initialQuizzes?: TeacherQuizListItem[];
  businessProfile?: BusinessProfile | null;
  integrationSettings?: IntegrationSettings[];
  credentialStatuses?: Record<string, CredentialStatusView>;
  initialReceipts?: Receipt[];
  initialExpenses?: Expense[];
  initialFamilyBalances?: FamilyBalanceSummary[];
  initialChargeRuns?: ChargeRun[];
  initialCalendarEvents?: CalendarEvent[];
  loadErrors?: string[];
};

function createSlotId(day: string, time: string) {
  return `${day}-${time}`;
}

function parseSlotId(slotId: string) {
  const [day, time] = slotId.split("-");
  return { day, time };
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
        "inline-flex items-center gap-2 rounded-md border px-3 py-1 text-xs font-semibold shadow-xs transition " +
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
        "group flex flex-col gap-1 rounded-md border bg-linear-to-br from-background to-muted/50 p-2 text-left shadow-xs transition " +
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
  tinted = false,
}: {
  slotId: string;
  classItem?: ClassItem;
  label: string;
  onClear: (slotId: string) => void;
  tinted?: boolean;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: `slot:${slotId}`,
  });

  return (
    <div
      ref={setNodeRef}
      className={
        "min-h-[64px] border-l border-dashed border-border/70 p-2 transition " +
        (isOver ? "bg-brand/10" : tinted ? "bg-accent/30" : "bg-card")
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
        <div className="text-[11px] text-muted-foreground/60">
          Drop class here
        </div>
      )}
    </div>
  );
}

export function TeacherDashboard({
  initialClasses,
  initialSlots,
  initialStudents,
  initialFamilies = [],
  initialAttendance,
  initialQuizzes = [],
  businessProfile = null,
  integrationSettings = [],
  credentialStatuses = {},
  initialReceipts = [],
  initialExpenses = [],
  initialFamilyBalances = [],
  initialChargeRuns = [],
  initialCalendarEvents = [],
  loadErrors = [],
}: TeacherDashboardProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );
  // Replaces the old hand-maintained tuition_status: derived from the
  // real family_balance_transactions ledger (see lib/billing), keyed by
  // family so the Students tab can show it without its own balance query.
  const familyBalanceById = React.useMemo(
    () => new Map(initialFamilyBalances.map((family) => [family.id, family])),
    [initialFamilyBalances],
  );
  const studentTuitionStatus = React.useCallback(
    (student: { familyId?: string }) => {
      const family = student.familyId
        ? familyBalanceById.get(student.familyId)
        : undefined;
      if (!family) return null;
      return deriveTuitionStatus({
        balance: family.balance,
        monthlyAmount: family.monthlyAmount,
      });
    },
    [familyBalanceById],
  );
  const [section, setSection] = React.useState<string>("schedule");
  const [isAddStudentOpen, setIsAddStudentOpen] = React.useState(false);
  const [studentQuery, setStudentQuery] = React.useState("");
  const [isCreateClassOpen, setIsCreateClassOpen] = React.useState(false);

  // Radix portals (dialogs, popovers, dropdowns) mount on <body>, outside
  // this component's subtree - tag the body so they pick up the console
  // theme tokens too.
  React.useEffect(() => {
    document.body.classList.add("theme-console");
    return () => {
      document.body.classList.remove("theme-console");
    };
  }, []);
  const [editClassId, setEditClassId] = React.useState<string | null>(null);
  const [classFormName, setClassFormName] = React.useState("");
  const [classFormHours, setClassFormHours] = React.useState("2");
  const [classFormGrade, setClassFormGrade] = React.useState("");
  const [isSavingClass, setIsSavingClass] = React.useState(false);
  const [isMutatingEnrollment, setIsMutatingEnrollment] = React.useState(false);
  const [showArchivedClasses, setShowArchivedClasses] = React.useState(false);
  const [selectedClassId, setSelectedClassId] = React.useState<
    string | null
  >(null);
  const [classes, setClasses] = React.useState<ClassItem[]>(() =>
    initialClasses.map((item, index) => ({
      ...item,
      grade: item.grade ?? null,
      color: COLOR_CLASSES[index % COLOR_CLASSES.length],
    })),
  );
  const [schedule, setSchedule] = React.useState<ScheduleState>(() => {
    const initial: ScheduleState = {};
    DAYS.forEach((day) => {
      SCHEDULE_ROWS.forEach((row) => {
        const cellTime = day === "Sat" ? row.satTime : row.time;
        initial[createSlotId(day, cellTime)] = null;
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
    familyMode: "new" as "new" | "existing",
    familyId: "",
    parentName: "",
    parentEmail: "",
    parentPhone: "",
    parentTwoName: "",
    parentTwoEmail: "",
    parentTwoPhone: "",
    tuitionAmount: "",
    assignedClassIds: [] as string[],
  });
  const [students, setStudents] =
    React.useState<StudentItem[]>(initialStudents);
  const [families, setFamilies] =
    React.useState<FamilyItem[]>(initialFamilies);
  const [showWithdrawn, setShowWithdrawn] = React.useState(false);
  const [showArchivedStudentClasses, setShowArchivedStudentClasses] =
    React.useState(false);
  const [showSecondParent, setShowSecondParent] = React.useState(false);
  const [studentFormErrors, setStudentFormErrors] = React.useState<
    Record<string, boolean>
  >({});
  const [selectedStudentId, setSelectedStudentId] = React.useState<
    string | null
  >(null);
  const [editStudentId, setEditStudentId] = React.useState<string | null>(
    null,
  );
  const [editStudentForm, setEditStudentForm] = React.useState({
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
  });
  const [showEditSecondParent, setShowEditSecondParent] =
    React.useState(false);
  const [editStudentFormErrors, setEditStudentFormErrors] = React.useState<
    Record<string, boolean>
  >({});
  const [isSavingStudent, setIsSavingStudent] = React.useState(false);
  const [manageStudentClassesId, setManageStudentClassesId] = React.useState<
    string | null
  >(null);
  const [attendanceDate, setAttendanceDate] = React.useState(() => new Date());
  const [attendanceClassId, setAttendanceClassId] = React.useState<string>("");
  const [attendanceStatusByStudent, setAttendanceStatusByStudent] =
    React.useState<Record<string, "present" | "late" | "absent" | "">>({});
  const [attendanceDateError, setAttendanceDateError] = React.useState("");
  const [attendanceRecords, setAttendanceRecords] =
    React.useState<AttendanceRecord[]>(initialAttendance);
  // Hoisted here rather than owned inside <TeacherCalendar> - adding an
  // extra session or a cancellation must unlock/lock the Attendance tab's
  // date picker immediately, not after a page reload.
  const [calendarEvents, setCalendarEvents] = React.useState<CalendarEvent[]>(
    initialCalendarEvents,
  );

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

  const activeClasses = React.useMemo(
    () => classes.filter((item) => !item.archivedAt),
    [classes],
  );

  const resetClassForm = () => {
    setClassFormName("");
    setClassFormHours("2");
    setClassFormGrade("");
  };

  const handleCreateClass = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = classFormName.trim();
    const hours = Number.parseInt(classFormHours, 10);
    if (!trimmed) {
      toast.error("Give the class a name");
      return;
    }
    if (Number.isNaN(hours) || hours < 1) {
      toast.error("Hours per week must be at least 1");
      return;
    }
    setIsSavingClass(true);
    try {
      const nextColor = COLOR_CLASSES[classes.length % COLOR_CLASSES.length];
      const created = await createClassAction({
        name: trimmed,
        hoursPerWeek: hours,
        grade: classFormGrade || null,
      });
      setClasses((prev) => [
        ...prev,
        {
          id: created.id,
          name: created.name,
          hoursPerWeek: created.hoursPerWeek,
          grade: created.grade,
          color: nextColor,
          archivedAt: null,
        },
      ]);
      toast.success("Class created");
      resetClassForm();
      setIsCreateClassOpen(false);
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : "Failed to create class",
      );
    } finally {
      setIsSavingClass(false);
    }
  };

  const openEditClassDialog = (classId: string) => {
    const classItem = classes.find((item) => item.id === classId);
    if (!classItem) {
      return;
    }
    setClassFormName(classItem.name);
    setClassFormHours(String(classItem.hoursPerWeek));
    setClassFormGrade(classItem.grade ?? "");
    setEditClassId(classId);
  };

  const closeEditClassDialog = () => {
    setEditClassId(null);
    resetClassForm();
  };

  const handleSaveEditClass = async () => {
    if (!editClassId) {
      return;
    }
    const trimmed = classFormName.trim();
    const hours = Number.parseInt(classFormHours, 10);
    if (!trimmed) {
      toast.error("Give the class a name");
      return;
    }
    if (Number.isNaN(hours) || hours < 1) {
      toast.error("Hours per week must be at least 1");
      return;
    }
    setIsSavingClass(true);
    try {
      const updated = await updateClassAction({
        classId: editClassId,
        name: trimmed,
        hoursPerWeek: hours,
        grade: classFormGrade || null,
      });
      setClasses((prev) =>
        prev.map((item) =>
          item.id === updated.id
            ? {
                ...item,
                name: updated.name,
                hoursPerWeek: updated.hoursPerWeek,
                grade: updated.grade,
              }
            : item,
        ),
      );
      toast.success("Class updated");
      closeEditClassDialog();
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : "Failed to update class",
      );
    } finally {
      setIsSavingClass(false);
    }
  };

  const handleArchiveClass = async (classId: string) => {
    try {
      const result = await archiveClassAction(classId);
      setClasses((prev) =>
        prev.map((item) =>
          item.id === classId
            ? { ...item, archivedAt: result.archivedAt }
            : item,
        ),
      );
      setSchedule((prev) => {
        const next = { ...prev };
        for (const [slotId, scheduledClassId] of Object.entries(next)) {
          if (scheduledClassId === classId) {
            next[slotId] = null;
          }
        }
        return next;
      });
      toast.success("Class archived and removed from the schedule");
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : "Failed to archive class",
      );
    }
  };

  const handleRestoreClass = async (classId: string) => {
    try {
      await restoreClassAction(classId);
      setClasses((prev) =>
        prev.map((item) =>
          item.id === classId ? { ...item, archivedAt: null } : item,
        ),
      );
      toast.success("Class restored");
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : "Failed to restore class",
      );
    }
  };

  const handleDeleteClass = async (classId: string) => {
    if (
      !window.confirm(
        "Delete this class? Attendance history is kept, but the class itself, its schedule, and any quiz assignments are gone for good.",
      )
    ) {
      return;
    }
    try {
      await deleteClassAction(classId);
      setClasses((prev) => prev.filter((item) => item.id !== classId));
      setSchedule((prev) => {
        const next = { ...prev };
        for (const [slotId, scheduledClassId] of Object.entries(next)) {
          if (scheduledClassId === classId) {
            next[slotId] = null;
          }
        }
        return next;
      });
      if (selectedClassId === classId) {
        setSelectedClassId(null);
      }
      toast.success("Class deleted");
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : "Failed to delete class",
      );
    }
  };

  const handleEnrollStudent = async (studentId: string, classId: string) => {
    setIsMutatingEnrollment(true);
    try {
      await enrollStudentInClassAction(studentId, classId);
      setStudents((prev) =>
        prev.map((student) =>
          student.id === studentId
            ? {
                ...student,
                assignedClassIds: student.assignedClassIds.includes(classId)
                  ? student.assignedClassIds
                  : [...student.assignedClassIds, classId],
              }
            : student,
        ),
      );
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : "Failed to enroll student",
      );
    } finally {
      setIsMutatingEnrollment(false);
    }
  };

  const handleUnenrollStudent = async (studentId: string, classId: string) => {
    setIsMutatingEnrollment(true);
    try {
      await unenrollStudentFromClassAction(studentId, classId);
      setStudents((prev) =>
        prev.map((student) =>
          student.id === studentId
            ? {
                ...student,
                assignedClassIds: student.assignedClassIds.filter(
                  (id) => id !== classId,
                ),
              }
            : student,
        ),
      );
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : "Failed to remove student",
      );
    } finally {
      setIsMutatingEnrollment(false);
    }
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
    value: string | string[],
  ) => {
    setStudentForm((prev) => ({ ...prev, [key]: value }));
    setStudentFormErrors((prev) => ({ ...prev, [key]: false }));
  };

  const handleToggleStudentClass = (classId: string) => {
    setStudentForm((prev) => ({
      ...prev,
      assignedClassIds: prev.assignedClassIds.includes(classId)
        ? prev.assignedClassIds.filter((id) => id !== classId)
        : [...prev.assignedClassIds, classId],
    }));
  };

  const handleAddStudent = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const missingFields: string[] = [];
    const errors: Record<string, boolean> = {};

    if (!studentForm.firstName.trim()) {
      missingFields.push("First name");
      errors.firstName = true;
    }
    if (!studentForm.lastName.trim()) {
      missingFields.push("Last name");
      errors.lastName = true;
    }
    if (!studentForm.gradeLevel.trim()) {
      missingFields.push("Grade");
      errors.gradeLevel = true;
    }
    if (!studentForm.email.trim()) {
      missingFields.push("Email");
      errors.email = true;
    }

    if (studentForm.familyMode === "existing") {
      if (!studentForm.familyId) {
        missingFields.push("Family");
        errors.familyId = true;
      }
    } else {
      if (!studentForm.parentName.trim()) {
        missingFields.push("Parent name");
        errors.parentName = true;
      }
      if (!studentForm.parentEmail.trim()) {
        missingFields.push("Parent email");
        errors.parentEmail = true;
      }
      if (!studentForm.parentPhone.trim()) {
        missingFields.push("Parent phone");
        errors.parentPhone = true;
      }
    }

    if (missingFields.length > 0) {
      setStudentFormErrors(errors);
      toast.error("Please fill in all required fields", {
        description: `Missing: ${missingFields.join(", ")}`,
      });
      return;
    }

    let created;
    try {
      created = await createStudentAction(
        studentForm.familyMode === "existing"
          ? {
              familyMode: "existing",
              familyId: studentForm.familyId,
              firstName: studentForm.firstName.trim(),
              lastName: studentForm.lastName.trim(),
              gradeLevel: studentForm.gradeLevel.trim(),
              email: studentForm.email.trim(),
              tuitionAmount: studentForm.tuitionAmount.trim(),
              assignedClassIds: studentForm.assignedClassIds,
            }
          : {
              familyMode: "new",
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
              assignedClassIds: studentForm.assignedClassIds,
            },
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to create student",
      );
      return;
    }

    setStudents((prev) => [created, ...prev]);
    setFamilies((prev) => {
      if (studentForm.familyMode === "existing") {
        return prev.map((family) =>
          family.id === created.familyId
            ? {
                ...family,
                studentNames: [
                  ...family.studentNames,
                  `${created.firstName} ${created.lastName}`,
                ],
              }
            : family,
        );
      }
      return [
        ...prev,
        {
          id: created.familyId,
          parentNames: [created.parentName, created.parentTwoName].filter(
            (name): name is string => Boolean(name),
          ),
          parentEmails: [created.parentEmail, created.parentTwoEmail].filter(
            (email): email is string => Boolean(email),
          ),
          studentNames: [`${created.firstName} ${created.lastName}`],
        },
      ];
    });
    setStudentForm({
      firstName: "",
      lastName: "",
      gradeLevel: "",
      email: "",
      familyMode: "new",
      familyId: "",
      parentName: "",
      parentEmail: "",
      parentPhone: "",
      parentTwoName: "",
      parentTwoEmail: "",
      parentTwoPhone: "",
      tuitionAmount: "",
      assignedClassIds: [],
    });
    setStudentFormErrors({});
    setShowSecondParent(false);
    setIsAddStudentOpen(false);
  };

  const handleWithdrawStudent = async (studentId: string) => {
    const result = await withdrawStudentAction(studentId);
    setStudents((prev) =>
      prev.map((student) =>
        student.id === studentId
          ? { ...student, withdrawnAt: result.withdrawnAt }
          : student,
      ),
    );
  };

  const handleRestoreStudent = async (studentId: string) => {
    const result = await restoreStudentAction(studentId);
    setStudents((prev) =>
      prev.map((student) =>
        student.id === studentId
          ? { ...student, withdrawnAt: result.withdrawnAt }
          : student,
      ),
    );
  };

  const handleEditStudentChange = (
    key: keyof typeof editStudentForm,
    value: string,
  ) => {
    setEditStudentForm((prev) => ({ ...prev, [key]: value }));
    setEditStudentFormErrors((prev) => ({ ...prev, [key]: false }));
  };

  const openEditStudentDialog = (studentId: string) => {
    const student = students.find((item) => item.id === studentId);
    if (!student) return;
    setEditStudentForm({
      firstName: student.firstName,
      lastName: student.lastName,
      gradeLevel: student.gradeLevel,
      email: student.email,
      parentName: student.parentName,
      parentEmail: student.parentEmail,
      parentPhone: student.parentPhone,
      parentTwoName: student.parentTwoName ?? "",
      parentTwoEmail: student.parentTwoEmail ?? "",
      parentTwoPhone: student.parentTwoPhone ?? "",
      tuitionAmount: student.tuitionAmount,
    });
    setShowEditSecondParent(
      Boolean(
        student.parentTwoName || student.parentTwoEmail || student.parentTwoPhone,
      ),
    );
    setEditStudentFormErrors({});
    setEditStudentId(studentId);
  };

  const closeEditStudentDialog = () => {
    setEditStudentId(null);
    setShowEditSecondParent(false);
    setEditStudentFormErrors({});
  };

  const handleSaveEditStudent = async () => {
    if (!editStudentId) return;

    const missingFields: string[] = [];
    const errors: Record<string, boolean> = {};

    if (!editStudentForm.firstName.trim()) {
      missingFields.push("First name");
      errors.firstName = true;
    }
    if (!editStudentForm.lastName.trim()) {
      missingFields.push("Last name");
      errors.lastName = true;
    }
    if (!editStudentForm.gradeLevel.trim()) {
      missingFields.push("Grade");
      errors.gradeLevel = true;
    }
    if (!editStudentForm.email.trim()) {
      missingFields.push("Email");
      errors.email = true;
    }
    if (!editStudentForm.parentName.trim()) {
      missingFields.push("Parent name");
      errors.parentName = true;
    }
    if (!editStudentForm.parentEmail.trim()) {
      missingFields.push("Parent email");
      errors.parentEmail = true;
    }
    if (!editStudentForm.parentPhone.trim()) {
      missingFields.push("Parent phone");
      errors.parentPhone = true;
    }

    if (missingFields.length > 0) {
      setEditStudentFormErrors(errors);
      toast.error("Please fill in all required fields", {
        description: `Missing: ${missingFields.join(", ")}`,
      });
      return;
    }

    setIsSavingStudent(true);
    let updated;
    try {
      updated = await updateStudentAction({
        studentId: editStudentId,
        firstName: editStudentForm.firstName.trim(),
        lastName: editStudentForm.lastName.trim(),
        gradeLevel: editStudentForm.gradeLevel.trim(),
        email: editStudentForm.email.trim(),
        tuitionAmount: editStudentForm.tuitionAmount.trim(),
        parentName: editStudentForm.parentName.trim(),
        parentEmail: editStudentForm.parentEmail.trim(),
        parentPhone: editStudentForm.parentPhone.trim(),
        parentTwoName: editStudentForm.parentTwoName.trim(),
        parentTwoEmail: editStudentForm.parentTwoEmail.trim(),
        parentTwoPhone: editStudentForm.parentTwoPhone.trim(),
      });
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : "Failed to update student",
      );
      setIsSavingStudent(false);
      return;
    }

    setStudents((prev) =>
      prev.map((student) => {
        if (student.id === updated.id) {
          return {
            ...student,
            firstName: updated.firstName,
            lastName: updated.lastName,
            gradeLevel: updated.gradeLevel,
            email: updated.email,
            parentName: updated.parentName,
            parentEmail: updated.parentEmail,
            parentPhone: updated.parentPhone,
            parentTwoName: updated.parentTwoName,
            parentTwoEmail: updated.parentTwoEmail,
            parentTwoPhone: updated.parentTwoPhone,
            tuitionAmount: updated.tuitionAmount,
          };
        }
        // A sibling in the same family shares the same parent contact
        // record - keep their cached copy of it in sync too, or it goes
        // stale until a full page reload.
        if (student.familyId === updated.familyId) {
          return {
            ...student,
            parentName: updated.parentName,
            parentEmail: updated.parentEmail,
            parentPhone: updated.parentPhone,
            parentTwoName: updated.parentTwoName,
            parentTwoEmail: updated.parentTwoEmail,
            parentTwoPhone: updated.parentTwoPhone,
          };
        }
        return student;
      }),
    );
    setFamilies((prev) =>
      prev.map((family) =>
        family.id === updated.familyId
          ? {
              ...family,
              parentNames: [updated.parentName, updated.parentTwoName].filter(
                (name): name is string => Boolean(name),
              ),
              parentEmails: [
                updated.parentEmail,
                updated.parentTwoEmail,
              ].filter((email): email is string => Boolean(email)),
            }
          : family,
      ),
    );

    toast.success("Student updated");
    setIsSavingStudent(false);
    closeEditStudentDialog();
  };

  const attendanceClassName = React.useMemo(
    () => classes.find((item) => item.id === attendanceClassId)?.name ?? "",
    [attendanceClassId, classes],
  );

  const attendanceRoster = React.useMemo(() => {
    if (!attendanceClassId) {
      return [];
    }
    return students.filter(
      (student) =>
        !student.withdrawnAt &&
        student.assignedClassIds.includes(attendanceClassId),
    );
  }, [attendanceClassId, students]);

  // Flattened once, shared by the attendance date-gating logic below and by
  // the Calendar tab's month projection.
  const scheduleSlotList = React.useMemo(
    () =>
      Object.entries(schedule)
        .filter((entry): entry is [string, string] => entry[1] !== null)
        .map(([slotId, classId]) => ({ ...parseSlotId(slotId), classId })),
    [schedule],
  );

  const attendanceDateSets = React.useMemo(
    () =>
      buildAttendanceDateSets({
        classId: attendanceClassId,
        slots: scheduleSlotList,
        events: calendarEvents.map((event) => ({
          event_type: event.event_type,
          class_id: event.class_id,
          event_date: event.event_date,
          start_time: event.start_time,
        })),
        attendance: attendanceRecords.map((record) => ({
          classId: record.classId,
          attendanceDate: record.attendanceDate,
        })),
      }),
    [attendanceClassId, scheduleSlotList, calendarEvents, attendanceRecords],
  );

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
            ),
        );
        if (status) {
          next.unshift({
            studentId,
            classId: attendanceClassId,
            className: attendanceClassName,
            attendanceDate: attendanceDateKey,
            status,
          });
        }
        return next;
      });
    },
    [attendanceClassId, attendanceClassName, attendanceDateKey],
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

    if (
      attendanceDateSets.scheduleWeekdays.size === 0 &&
      attendanceDateSets.extraSessionDates.size === 0 &&
      attendanceDateSets.datesWithAttendance.size === 0
    ) {
      setAttendanceDateError("This class has no scheduled days yet.");
      return;
    }

    if (!isDateEnabledForAttendance(value, attendanceDateSets)) {
      setAttendanceDateError(
        attendanceDateSets.cancelledDates.has(format(value, "yyyy-MM-dd"))
          ? "That class is cancelled on this date."
          : "Pick a scheduled class date, or add an extra session in the Calendar tab.",
      );
      return;
    }

    setAttendanceDate(value);
    setAttendanceDateError("");
    setAttendanceStatusByStudent({});
  };

  const activeSection =
    SECTIONS.find((item) => item.value === section) ?? SECTIONS[0];

  const visibleStudents = React.useMemo(() => {
    const query = studentQuery.trim().toLowerCase();
    return students.filter((student) => {
      if (!showWithdrawn && student.withdrawnAt) {
        return false;
      }
      if (!query) {
        return true;
      }
      const haystack = [
        student.firstName,
        student.lastName,
        student.email,
        student.parentName,
        student.parentTwoName ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [students, showWithdrawn, studentQuery]);

  return (
    <div className="theme-console flex min-h-svh w-full bg-background text-foreground">
      <Tabs
        value={section}
        onValueChange={setSection}
        orientation="vertical"
        className="flex w-full flex-row items-stretch gap-0"
      >
        <aside className="sticky top-0 z-30 flex h-svh w-14 shrink-0 flex-col border-r border-border bg-card lg:w-60">
          <div className="flex h-14 shrink-0 items-center justify-center gap-2.5 border-b border-border px-0 lg:justify-start lg:px-4">
            <div className="grid size-7 shrink-0 place-items-center rounded-md bg-primary text-[13px] font-bold text-primary-foreground">
              M
            </div>
            <div className="hidden leading-tight lg:block">
              <div className="text-sm font-semibold tracking-tight">Modus</div>
              <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                Console
              </div>
            </div>
          </div>

          <TabsList
            variant="line"
            className="flex h-auto w-full flex-col items-stretch gap-1 rounded-none bg-transparent p-2"
          >
            {SECTIONS.map((item) => (
              <TabsTrigger
                key={item.value}
                value={item.value}
                title={item.label}
                className="h-9 w-full flex-none justify-center gap-2.5 rounded-md border-0 px-0 text-[13px] font-medium text-muted-foreground after:hidden hover:bg-accent hover:text-foreground data-[state=active]:bg-accent data-[state=active]:text-foreground data-[state=active]:shadow-none lg:justify-start lg:px-2.5"
              >
                <item.icon className="size-4 shrink-0" />
                <span className="hidden lg:inline">{item.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          <div className="mt-auto hidden shrink-0 border-t border-border px-4 py-3 lg:block">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span
                className="size-1.5 rounded-full bg-brand"
                aria-hidden="true"
              />
              Signed in as Vagios
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border bg-background/90 px-4 backdrop-blur lg:px-6">
            <div className="min-w-0">
              <h1 className="truncate text-sm font-semibold tracking-tight">
                {activeSection.label}
              </h1>
              <p className="hidden truncate text-xs text-muted-foreground sm:block">
                {activeSection.description}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <ThemeSwitcher />
              <LogoutButton />
            </div>
          </header>

          <main className="flex-1 space-y-4 p-4 lg:p-6">
            {loadErrors.length > 0 ? (
              <Alert>
                <AlertTitle>Supabase load error</AlertTitle>
                <AlertDescription>
                  <div className="space-y-2">
                    <p className="text-sm">
                      We could not fetch your data. Check the schema and RLS
                      policies, then reload.
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

        <TabsContent value="schedule" className="mt-0 space-y-4">
          <DndContext
            id="teacher-schedule"
            sensors={sensors}
            onDragEnd={handleDragEnd}
          >
            <div className="rounded-lg border border-border bg-card">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Class dock
                </span>
                <span className="text-xs text-muted-foreground">
                  Remaining slots follow each class based on hours per week.
                </span>
              </div>
              <div className="flex flex-wrap gap-2 p-3">
                {activeClasses.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No classes yet. Add one in the Classes section.
                  </p>
                ) : (
                  activeClasses.map((item) => (
                    <DraggableClassChip
                      key={item.id}
                      classItem={item}
                      remaining={remainingById.get(item.id) ?? 0}
                    />
                  ))
                )}
              </div>
            </div>

            <div className="overflow-x-auto rounded-lg border border-border bg-card">
              <div className="min-w-[1080px]">
                <div className="grid grid-cols-[72px_repeat(6,minmax(0,1fr))_72px] border-b bg-muted/40 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <div className="px-3 py-2">Time</div>
                  {DAYS.map((day) => (
                    <div
                      key={day}
                      className={
                        "px-3 py-2" + (day === "Sat" ? " bg-accent/30" : "")
                      }
                    >
                      {day}
                    </div>
                  ))}
                  <div
                    className="border-l border-dashed border-border/70 bg-accent/30 px-3 py-2"
                    title="Real clock time for the Saturday column — no school Saturday, so cram classes can start in the morning"
                  >
                    Sat time
                  </div>
                </div>

                {SCHEDULE_ROWS.map((row) => (
                  <div
                    key={row.time}
                    className="grid grid-cols-[72px_repeat(6,minmax(0,1fr))_72px] border-b last:border-b-0"
                  >
                    <div className="px-3 py-4 text-xs font-medium text-muted-foreground">
                      {row.time}
                    </div>
                    {DAYS.map((day) => {
                      const cellTime = day === "Sat" ? row.satTime : row.time;
                      const slotId = createSlotId(day, cellTime);
                      const classId = schedule[slotId] ?? null;
                      const classItem = classes.find(
                        (item) => item.id === classId,
                      );
                      const label = `${day} ${cellTime}`;

                      return (
                        <ScheduleCell
                          key={slotId}
                          slotId={slotId}
                          classItem={classItem}
                          label={label}
                          onClear={handleClearSlot}
                          tinted={day === "Sat"}
                        />
                      );
                    })}
                    <div className="border-l border-dashed border-border/70 bg-accent/30 px-3 py-4 text-xs font-medium text-muted-foreground">
                      {row.satTime}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </DndContext>
        </TabsContent>

        <TabsContent value="calendar" className="mt-0">
          <TeacherCalendar
            events={calendarEvents}
            onEventsChange={setCalendarEvents}
            classes={classes}
            students={students}
            slots={scheduleSlotList}
          />
        </TabsContent>

        <TabsContent value="classes" className="mt-0">
          {selectedClassId ? (
            (() => {
              const classItem = classes.find(
                (item) => item.id === selectedClassId,
              );
              if (!classItem) {
                return null;
              }
              const scheduledSlots = Object.entries(schedule)
                .filter(([, classId]) => classId === selectedClassId)
                .map(([slotId]) => parseSlotId(slotId));
              const enrolledStudents = students.filter(
                (student) =>
                  !student.withdrawnAt &&
                  student.assignedClassIds.includes(selectedClassId),
              );
              const assignedQuizzes = initialQuizzes.filter((quiz) =>
                quiz.assignedClasses.some((c) => c.id === selectedClassId),
              );
              return (
                <TeacherClassDetail
                  classItem={classItem}
                  scheduledSlots={scheduledSlots}
                  enrolledStudents={enrolledStudents}
                  allStudents={students.filter(
                    (student) => !student.withdrawnAt,
                  )}
                  assignedQuizzes={assignedQuizzes}
                  isSavingClass={isSavingClass}
                  isMutatingEnrollment={isMutatingEnrollment}
                  onBack={() => setSelectedClassId(null)}
                  onEdit={() => openEditClassDialog(classItem.id)}
                  onArchive={() => void handleArchiveClass(classItem.id)}
                  onRestore={() => void handleRestoreClass(classItem.id)}
                  onDelete={() => void handleDeleteClass(classItem.id)}
                  onViewStudent={(studentId) => {
                    setSection("students");
                    setSelectedStudentId(studentId);
                  }}
                  onGoToQuizzes={() => setSection("quizzes")}
                  onEnrollStudent={(studentId) =>
                    void handleEnrollStudent(studentId, classItem.id)
                  }
                  onUnenrollStudent={(studentId) =>
                    void handleUnenrollStudent(studentId, classItem.id)
                  }
                />
              );
            })()
          ) : (
            <>
          <div className="rounded-lg border border-border bg-card">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
              <div className="text-sm font-semibold">
                Classes{" "}
                <span className="font-normal text-muted-foreground">
                  ·{" "}
                  {
                    classes.filter(
                      (item) => showArchivedClasses || !item.archivedAt,
                    ).length
                  }
                </span>
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Checkbox
                    checked={showArchivedClasses}
                    onCheckedChange={(checked) =>
                      setShowArchivedClasses(checked === true)
                    }
                  />
                  Show archived
                </label>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setIsCreateClassOpen(true)}
                >
                  <PlusIcon className="mr-1 h-3.5 w-3.5" /> Add class
                </Button>
              </div>
            </div>
            {classes.filter(
              (item) => showArchivedClasses || !item.archivedAt,
            ).length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                No classes yet. Add one above.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Class</TableHead>
                    <TableHead>Hours / week</TableHead>
                    <TableHead>Scheduled</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {classes
                    .filter((item) => showArchivedClasses || !item.archivedAt)
                    .map((item) => (
                      <TableRow
                        key={item.id}
                        className="cursor-pointer"
                        onClick={() => setSelectedClassId(item.id)}
                      >
                        <TableCell>
                          <div className="flex items-center gap-2.5">
                            <span
                              className={
                                "inline-block size-2.5 shrink-0 rounded-full border " +
                                item.color
                              }
                              aria-hidden="true"
                            />
                            <div>
                              <span className="font-medium">{item.name}</span>
                              {item.grade && (
                                <p className="text-xs text-muted-foreground">
                                  {CLASS_GRADE_LABELS[item.grade] ?? item.grade}
                                </p>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {item.hoursPerWeek}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {scheduledCounts.get(item.id) ?? 0} of{" "}
                          {item.hoursPerWeek} slots
                        </TableCell>
                        <TableCell>
                          {item.archivedAt ? (
                            <Badge variant="secondary">Archived</Badge>
                          ) : (
                            <Badge variant="outline">Active</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={(event) => {
                                event.stopPropagation();
                                openEditClassDialog(item.id);
                              }}
                            >
                              <PencilIcon className="mr-1 h-3.5 w-3.5" /> Edit
                            </Button>
                            {item.archivedAt ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void handleRestoreClass(item.id);
                                }}
                              >
                                <RotateCcwIcon className="mr-1 h-3.5 w-3.5" />{" "}
                                Restore
                              </Button>
                            ) : (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void handleArchiveClass(item.id);
                                }}
                              >
                                <ArchiveIcon className="mr-1 h-3.5 w-3.5" />{" "}
                                Archive
                              </Button>
                            )}
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={(event) => {
                                event.stopPropagation();
                                void handleDeleteClass(item.id);
                              }}
                            >
                              <Trash2Icon className="mr-1 h-3.5 w-3.5" />{" "}
                              Delete
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            )}
          </div>
            </>
          )}

          <Dialog
            open={isCreateClassOpen}
            onOpenChange={(open) => {
              setIsCreateClassOpen(open);
              if (!open) {
                resetClassForm();
              }
            }}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add class</DialogTitle>
              </DialogHeader>
              <form className="space-y-3" onSubmit={handleCreateClass}>
                <div className="space-y-2">
                  <Label htmlFor="class-name">Class name</Label>
                  <Input
                    id="class-name"
                    value={classFormName}
                    onChange={(event) => setClassFormName(event.target.value)}
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
                    value={classFormHours}
                    onChange={(event) => setClassFormHours(event.target.value)}
                    placeholder="e.g. 3"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="class-grade">Grade (optional)</Label>
                  <select
                    id="class-grade"
                    value={classFormGrade}
                    onChange={(event) => setClassFormGrade(event.target.value)}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="">Not set</option>
                    {CLASS_GRADES.map((grade) => (
                      <option key={grade.code} value={grade.code}>
                        {grade.label}
                      </option>
                    ))}
                  </select>
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={isSavingClass}
                >
                  {isSavingClass ? "Creating..." : "Create class"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog
            open={editClassId !== null}
            onOpenChange={(open) => !open && closeEditClassDialog()}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit class</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="edit-class-name">Class name</Label>
                  <Input
                    id="edit-class-name"
                    value={classFormName}
                    onChange={(event) => setClassFormName(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-hours-per-week">Hours per week</Label>
                  <Input
                    id="edit-hours-per-week"
                    type="number"
                    min={1}
                    max={40}
                    value={classFormHours}
                    onChange={(event) => setClassFormHours(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-class-grade">Grade (optional)</Label>
                  <select
                    id="edit-class-grade"
                    value={classFormGrade}
                    onChange={(event) => setClassFormGrade(event.target.value)}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="">Not set</option>
                    {CLASS_GRADES.map((grade) => (
                      <option key={grade.code} value={grade.code}>
                        {grade.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  onClick={handleSaveEditClass}
                  disabled={isSavingClass}
                >
                  {isSavingClass ? "Saving..." : "Save"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="students" className="mt-0">
          {selectedStudentId ? (
            <div className="animate-in fade-in slide-in-from-right-8 duration-300">
              {(() => {
                const student = students.find(
                  (item) => item.id === selectedStudentId,
                );
                if (!student) {
                  return null;
                }
                return (
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between gap-4">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          {student.firstName} {student.lastName}
                          {student.withdrawnAt ? (
                            <Badge variant="destructive">Withdrawn</Badge>
                          ) : null}
                        </CardTitle>
                        <div className="text-sm text-muted-foreground">
                          Grade {student.gradeLevel || "N/A"} •{" "}
                          {student.email || "No email"}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          onClick={() => openEditStudentDialog(student.id)}
                        >
                          <PencilIcon className="mr-1 h-3.5 w-3.5" /> Edit
                        </Button>
                        {student.withdrawnAt ? (
                          <Button
                            variant="outline"
                            onClick={() => handleRestoreStudent(student.id)}
                          >
                            Restore
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            onClick={() => handleWithdrawStudent(student.id)}
                          >
                            Withdraw
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          onClick={() => setSelectedStudentId(null)}
                        >
                          Back to students
                        </Button>
                      </div>
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
                                {student.parentEmail || "No email"} •{" "}
                                {student.parentPhone || "No phone"}
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
                                  {student.parentTwoEmail || "No email"} •{" "}
                                  {student.parentTwoPhone || "No phone"}
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
                              ? formatEuro(Number(student.tuitionAmount))
                              : "No amount"}
                          </div>
                          {studentTuitionStatus(student) && (
                            <div className="text-xs text-muted-foreground">
                              Status:{" "}
                              {TUITION_STATUS_LABELS_EN[studentTuitionStatus(student)!]}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="rounded-lg border p-4">
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-xs uppercase tracking-wide text-muted-foreground">
                              Assigned classes
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                setManageStudentClassesId(student.id)
                              }
                            >
                              Manage classes
                            </Button>
                          </div>
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            {(() => {
                              const activeAssignedIds =
                                student.assignedClassIds.filter(
                                  (classId) =>
                                    !classes.find(
                                      (item) => item.id === classId,
                                    )?.archivedAt,
                                );
                              const archivedAssignedIds =
                                student.assignedClassIds.filter(
                                  (classId) =>
                                    classes.find(
                                      (item) => item.id === classId,
                                    )?.archivedAt,
                                );
                              if (student.assignedClassIds.length === 0) {
                                return (
                                  <span className="text-xs text-muted-foreground">
                                    No assigned classes
                                  </span>
                                );
                              }
                              return (
                                <>
                                  {activeAssignedIds.length === 0 &&
                                  !showArchivedStudentClasses ? (
                                    <span className="text-xs text-muted-foreground">
                                      No active classes
                                    </span>
                                  ) : (
                                    activeAssignedIds.map((classId) => {
                                      const className =
                                        classes.find(
                                          (item) => item.id === classId,
                                        )?.name ?? "Unknown class";
                                      return (
                                        <Badge
                                          key={classId}
                                          variant="outline"
                                        >
                                          {className}
                                        </Badge>
                                      );
                                    })
                                  )}
                                  {archivedAssignedIds.length > 0 ? (
                                    showArchivedStudentClasses ? (
                                      archivedAssignedIds.map((classId) => {
                                        const className =
                                          classes.find(
                                            (item) => item.id === classId,
                                          )?.name ?? "Unknown class";
                                        return (
                                          <Badge
                                            key={classId}
                                            variant="secondary"
                                          >
                                            {className}
                                          </Badge>
                                        );
                                      })
                                    ) : (
                                      <button
                                        type="button"
                                        className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                                        onClick={() =>
                                          setShowArchivedStudentClasses(true)
                                        }
                                      >
                                        +{archivedAssignedIds.length} archived
                                      </button>
                                    )
                                  ) : null}
                                </>
                              );
                            })()}
                          </div>
                        </div>

                        <div className="rounded-lg border p-4">
                          <div className="text-xs uppercase tracking-wide text-muted-foreground">
                            Tuition status
                          </div>
                          <div className="mt-3">
                            {studentTuitionStatus(student) ? (
                              <Badge variant="secondary">
                                {TUITION_STATUS_LABELS_EN[studentTuitionStatus(student)!]}
                              </Badge>
                            ) : (
                              <span className="text-sm text-muted-foreground">
                                See the Billing tab
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="rounded-lg border p-4">
                          <div className="text-xs uppercase tracking-wide text-muted-foreground">
                            Attendance
                          </div>
                          <div className="mt-3 space-y-2 text-xs">
                            {attendanceRecords.filter(
                              (record) => record.studentId === student.id,
                            ).length === 0 ? (
                              <div className="text-muted-foreground">
                                No attendance records yet.
                              </div>
                            ) : (
                              <div className="divide-y rounded-md border">
                                {attendanceRecords
                                  .filter(
                                    (record) => record.studentId === student.id,
                                  )
                                  .slice(0, 10)
                                  .map((record) => {
                                    const className =
                                      classes.find(
                                        (item) => item.id === record.classId,
                                      )?.name ?? record.className;
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
            <div className="space-y-4">
              <Dialog open={isAddStudentOpen} onOpenChange={setIsAddStudentOpen}>
                <DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Add student</DialogTitle>
                  </DialogHeader>
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
                          className={
                            studentFormErrors.firstName
                              ? "border-red-500 focus-visible:ring-red-500"
                              : ""
                          }
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
                          className={
                            studentFormErrors.lastName
                              ? "border-red-500 focus-visible:ring-red-500"
                              : ""
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="student-grade">Grade</Label>
                        <select
                          id="student-grade"
                          value={studentForm.gradeLevel}
                          onChange={(event) =>
                            handleStudentChange(
                              "gradeLevel",
                              event.target.value,
                            )
                          }
                          className={`h-10 w-full rounded-md border bg-background px-3 text-sm ${
                            studentFormErrors.gradeLevel
                              ? "border-red-500 focus-visible:ring-red-500"
                              : "border-input"
                          }`}
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
                          className={
                            studentFormErrors.email
                              ? "border-red-500 focus-visible:ring-red-500"
                              : ""
                          }
                        />
                      </div>
                    </div>

                    <div className="rounded-lg border p-4 space-y-4">
                      <div className="text-sm font-medium">Family</div>
                      <RadioGroup
                        value={studentForm.familyMode}
                        onValueChange={(value) =>
                          handleStudentChange(
                            "familyMode",
                            value as "new" | "existing",
                          )
                        }
                        className="flex gap-4"
                      >
                        <label className="flex items-center gap-2 text-sm">
                          <RadioGroupItem id="family-mode-new" value="new" />
                          New family
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                          <RadioGroupItem
                            id="family-mode-existing"
                            value="existing"
                          />
                          Existing family
                        </label>
                      </RadioGroup>

                      {studentForm.familyMode === "existing" ? (
                        <div className="space-y-2">
                          <Label htmlFor="existing-family">
                            Select family
                          </Label>
                          <select
                            id="existing-family"
                            value={studentForm.familyId}
                            onChange={(event) =>
                              handleStudentChange(
                                "familyId",
                                event.target.value,
                              )
                            }
                            className={`h-10 w-full rounded-md border bg-background px-3 text-sm ${
                              studentFormErrors.familyId
                                ? "border-red-500 focus-visible:ring-red-500"
                                : "border-input"
                            }`}
                          >
                            <option value="">Select a family</option>
                            {families.map((family) => (
                              <option key={family.id} value={family.id}>
                                {family.parentNames.join(" & ") ||
                                  "Unnamed parent"}{" "}
                                — {family.studentNames.join(", ")}
                              </option>
                            ))}
                          </select>
                          {families.length === 0 ? (
                            <p className="text-xs text-muted-foreground">
                              No existing families yet - create a student with
                              &quot;New family&quot; first.
                            </p>
                          ) : null}
                        </div>
                      ) : (
                        <div>
                      <div className="mt-3 grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="parent-name">Parent name</Label>
                          <Input
                            id="parent-name"
                            value={studentForm.parentName}
                            onChange={(event) =>
                              handleStudentChange(
                                "parentName",
                                event.target.value,
                              )
                            }
                            placeholder="e.g. Jordan Carter"
                            className={
                              studentFormErrors.parentName
                                ? "border-red-500 focus-visible:ring-red-500"
                                : ""
                            }
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
                                event.target.value,
                              )
                            }
                            placeholder="parent@email.com"
                            className={
                              studentFormErrors.parentEmail
                                ? "border-red-500 focus-visible:ring-red-500"
                                : ""
                            }
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
                                event.target.value,
                              )
                            }
                            placeholder="(555) 654-1234"
                            className={
                              studentFormErrors.parentPhone
                                ? "border-red-500 focus-visible:ring-red-500"
                                : ""
                            }
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
                                    event.target.value,
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
                                    event.target.value,
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
                                    event.target.value,
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
                      )}
                    </div>

                    <div className="rounded-lg border p-4">
                      <div className="text-sm font-medium">Tuition</div>
                      <div className="mt-3 space-y-2">
                        <Label htmlFor="tuition-amount">
                          Monthly tuition (€)
                        </Label>
                        <Input
                          id="tuition-amount"
                          type="number"
                          min={0}
                          value={studentForm.tuitionAmount}
                          onChange={(event) =>
                            handleStudentChange(
                              "tuitionAmount",
                              event.target.value,
                            )
                          }
                          placeholder="e.g. 120"
                        />
                        <p className="text-xs text-muted-foreground">
                          Added to this family&apos;s monthly charge in the
                          Billing tab.
                        </p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="text-sm font-medium">
                        Assigned classes
                      </div>
                      <div className="grid gap-3">
                        {activeClasses.length === 0 ? (
                          <p className="text-xs text-muted-foreground">
                            Create classes in the Classes tab first.
                          </p>
                        ) : (
                          activeClasses.map((classItem) => (
                            <label
                              key={classItem.id}
                              className="flex items-center gap-3 rounded-md border p-3 text-sm"
                            >
                              <Checkbox
                                checked={studentForm.assignedClassIds.includes(
                                  classItem.id,
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
                </DialogContent>
              </Dialog>

              <div className="rounded-lg border border-border bg-card">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="text-sm font-semibold">
                      Students{" "}
                      <span className="font-normal text-muted-foreground">
                        · {visibleStudents.length}
                      </span>
                    </div>
                    <div className="relative">
                      <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={studentQuery}
                        onChange={(event) =>
                          setStudentQuery(event.target.value)
                        }
                        placeholder="Search students…"
                        className="h-8 w-48 pl-8 text-sm md:w-64"
                        aria-label="Search students"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Checkbox
                        checked={showWithdrawn}
                        onCheckedChange={(checked) =>
                          setShowWithdrawn(checked === true)
                        }
                      />
                      Show withdrawn
                    </label>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => setIsAddStudentOpen(true)}
                    >
                      <PlusIcon className="mr-1 h-3.5 w-3.5" /> Add student
                    </Button>
                  </div>
                </div>
                {visibleStudents.length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                    {studentQuery.trim()
                      ? "No students match your search."
                      : "No students yet. Add one above."}
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Student</TableHead>
                        <TableHead>Grade</TableHead>
                        <TableHead>Parent</TableHead>
                        <TableHead>Classes</TableHead>
                        <TableHead>Tuition</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visibleStudents.map((student) => (
                        <TableRow
                          key={student.id}
                          className="cursor-pointer"
                          onClick={() => setSelectedStudentId(student.id)}
                        >
                          <TableCell>
                            <div className="flex items-center gap-2 font-medium">
                              {student.firstName} {student.lastName}
                              {student.withdrawnAt ? (
                                <Badge variant="destructive">Withdrawn</Badge>
                              ) : null}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {student.email || "No email"}
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {student.gradeLevel || "N/A"}
                          </TableCell>
                          <TableCell>
                            <div>{student.parentName || "Not set"}</div>
                            <div className="text-xs text-muted-foreground">
                              {student.parentPhone || "No phone"}
                            </div>
                          </TableCell>
                          <TableCell className="whitespace-normal">
                            <div className="flex max-w-56 flex-wrap gap-1">
                              {student.assignedClassIds.length === 0 ? (
                                <span className="text-xs text-muted-foreground">
                                  None
                                </span>
                              ) : (
                                student.assignedClassIds.map((classId) => {
                                  const className =
                                    classes.find(
                                      (item) => item.id === classId,
                                    )?.name ?? "Unknown class";
                                  return (
                                    <Badge key={classId} variant="outline">
                                      {className}
                                    </Badge>
                                  );
                                })
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div>
                              {student.tuitionAmount
                                ? formatEuro(Number(student.tuitionAmount))
                                : "—"}
                            </div>
                            {studentTuitionStatus(student) && (
                              <div className="text-xs text-muted-foreground">
                                {TUITION_STATUS_LABELS_EN[studentTuitionStatus(student)!]}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {student.withdrawnAt ? (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void handleRestoreStudent(student.id);
                                }}
                              >
                                Restore
                              </Button>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void handleWithdrawStudent(student.id);
                                }}
                              >
                                Withdraw
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            </div>
          )}

          <Dialog
                open={editStudentId !== null}
                onOpenChange={(open) => !open && closeEditStudentDialog()}
              >
                <DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Edit student</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="edit-student-first-name">
                          First name
                        </Label>
                        <Input
                          id="edit-student-first-name"
                          value={editStudentForm.firstName}
                          onChange={(event) =>
                            handleEditStudentChange(
                              "firstName",
                              event.target.value,
                            )
                          }
                          className={
                            editStudentFormErrors.firstName
                              ? "border-red-500 focus-visible:ring-red-500"
                              : ""
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="edit-student-last-name">
                          Last name
                        </Label>
                        <Input
                          id="edit-student-last-name"
                          value={editStudentForm.lastName}
                          onChange={(event) =>
                            handleEditStudentChange(
                              "lastName",
                              event.target.value,
                            )
                          }
                          className={
                            editStudentFormErrors.lastName
                              ? "border-red-500 focus-visible:ring-red-500"
                              : ""
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="edit-student-grade">Grade</Label>
                        <select
                          id="edit-student-grade"
                          value={editStudentForm.gradeLevel}
                          onChange={(event) =>
                            handleEditStudentChange(
                              "gradeLevel",
                              event.target.value,
                            )
                          }
                          className={`h-10 w-full rounded-md border bg-background px-3 text-sm ${
                            editStudentFormErrors.gradeLevel
                              ? "border-red-500 focus-visible:ring-red-500"
                              : "border-input"
                          }`}
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
                        <Label htmlFor="edit-student-email">Email</Label>
                        <Input
                          id="edit-student-email"
                          type="email"
                          value={editStudentForm.email}
                          onChange={(event) =>
                            handleEditStudentChange(
                              "email",
                              event.target.value,
                            )
                          }
                          className={
                            editStudentFormErrors.email
                              ? "border-red-500 focus-visible:ring-red-500"
                              : ""
                          }
                        />
                      </div>
                    </div>

                    <div className="rounded-lg border p-4 space-y-4">
                      <div className="text-sm font-medium">Parent</div>
                      {(() => {
                        const editingStudent = students.find(
                          (item) => item.id === editStudentId,
                        );
                        const siblingCount = editingStudent
                          ? (
                              families.find(
                                (family) =>
                                  family.id === editingStudent.familyId,
                              )?.studentNames.length ?? 1
                            ) - 1
                          : 0;
                        return siblingCount > 0 ? (
                          <p className="text-xs text-muted-foreground">
                            Shared with {siblingCount} other{" "}
                            {siblingCount === 1 ? "sibling" : "siblings"} in
                            this family — editing here updates it for them
                            too.
                          </p>
                        ) : null;
                      })()}
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="edit-parent-name">
                            Parent name
                          </Label>
                          <Input
                            id="edit-parent-name"
                            value={editStudentForm.parentName}
                            onChange={(event) =>
                              handleEditStudentChange(
                                "parentName",
                                event.target.value,
                              )
                            }
                            className={
                              editStudentFormErrors.parentName
                                ? "border-red-500 focus-visible:ring-red-500"
                                : ""
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="edit-parent-email">
                            Parent email
                          </Label>
                          <Input
                            id="edit-parent-email"
                            type="email"
                            value={editStudentForm.parentEmail}
                            onChange={(event) =>
                              handleEditStudentChange(
                                "parentEmail",
                                event.target.value,
                              )
                            }
                            className={
                              editStudentFormErrors.parentEmail
                                ? "border-red-500 focus-visible:ring-red-500"
                                : ""
                            }
                          />
                        </div>
                        <div className="space-y-2 sm:col-span-2">
                          <Label htmlFor="edit-parent-phone">
                            Parent phone
                          </Label>
                          <Input
                            id="edit-parent-phone"
                            value={editStudentForm.parentPhone}
                            onChange={(event) =>
                              handleEditStudentChange(
                                "parentPhone",
                                event.target.value,
                              )
                            }
                            className={
                              editStudentFormErrors.parentPhone
                                ? "border-red-500 focus-visible:ring-red-500"
                                : ""
                            }
                          />
                        </div>
                      </div>
                      {showEditSecondParent ? (
                        <div className="mt-4 border-t pt-4">
                          <div className="text-sm font-medium">
                            Second parent
                          </div>
                          <div className="mt-3 grid gap-4 sm:grid-cols-2">
                            <div className="space-y-2">
                              <Label htmlFor="edit-parent-two-name">
                                Name
                              </Label>
                              <Input
                                id="edit-parent-two-name"
                                value={editStudentForm.parentTwoName}
                                onChange={(event) =>
                                  handleEditStudentChange(
                                    "parentTwoName",
                                    event.target.value,
                                  )
                                }
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="edit-parent-two-email">
                                Email
                              </Label>
                              <Input
                                id="edit-parent-two-email"
                                type="email"
                                value={editStudentForm.parentTwoEmail}
                                onChange={(event) =>
                                  handleEditStudentChange(
                                    "parentTwoEmail",
                                    event.target.value,
                                  )
                                }
                              />
                            </div>
                            <div className="space-y-2 sm:col-span-2">
                              <Label htmlFor="edit-parent-two-phone">
                                Phone
                              </Label>
                              <Input
                                id="edit-parent-two-phone"
                                value={editStudentForm.parentTwoPhone}
                                onChange={(event) =>
                                  handleEditStudentChange(
                                    "parentTwoPhone",
                                    event.target.value,
                                  )
                                }
                              />
                            </div>
                          </div>
                        </div>
                      ) : null}
                      <Button
                        type="button"
                        variant="outline"
                        className="mt-4"
                        onClick={() =>
                          setShowEditSecondParent((prev) => !prev)
                        }
                      >
                        {showEditSecondParent ? "Remove" : "Add"} second
                        parent
                      </Button>
                    </div>

                    <div className="rounded-lg border p-4">
                      <div className="text-sm font-medium">Tuition</div>
                      <div className="mt-3 space-y-2">
                        <Label htmlFor="edit-tuition-amount">
                          Monthly tuition (€)
                        </Label>
                        <Input
                          id="edit-tuition-amount"
                          type="number"
                          min={0}
                          value={editStudentForm.tuitionAmount}
                          onChange={(event) =>
                            handleEditStudentChange(
                              "tuitionAmount",
                              event.target.value,
                            )
                          }
                          placeholder="e.g. 120"
                        />
                        <p className="text-xs text-muted-foreground">
                          Added to this family&apos;s monthly charge in the
                          Billing tab.
                        </p>
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button
                      type="button"
                      onClick={handleSaveEditStudent}
                      disabled={isSavingStudent}
                    >
                      {isSavingStudent ? "Saving..." : "Save"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <Dialog
                open={manageStudentClassesId !== null}
                onOpenChange={(open) => !open && setManageStudentClassesId(null)}
              >
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Manage classes</DialogTitle>
                  </DialogHeader>
                  <div className="grid gap-2">
                    {(() => {
                      const managedStudent = students.find(
                        (item) => item.id === manageStudentClassesId,
                      );
                      if (!managedStudent) {
                        return null;
                      }
                      return activeClasses.map((classItem) => {
                        const isEnrolled =
                          managedStudent.assignedClassIds.includes(
                            classItem.id,
                          );
                        return (
                          <label
                            key={classItem.id}
                            className="flex items-center gap-3 rounded-md border p-3 text-sm"
                          >
                            <Checkbox
                              checked={isEnrolled}
                              disabled={isMutatingEnrollment}
                              onCheckedChange={() =>
                                isEnrolled
                                  ? void handleUnenrollStudent(
                                      managedStudent.id,
                                      classItem.id,
                                    )
                                  : void handleEnrollStudent(
                                      managedStudent.id,
                                      classItem.id,
                                    )
                              }
                            />
                            <span className="flex-1">{classItem.name}</span>
                          </label>
                        );
                      });
                    })()}
                  </div>
                  <DialogFooter showCloseButton />
                </DialogContent>
              </Dialog>
        </TabsContent>

        <TabsContent value="attendance" className="mt-0 space-y-4">
          <div className="rounded-lg border border-border bg-card">
            <div className="flex flex-wrap items-end gap-x-6 gap-y-4 px-4 py-3">
                <div className="w-full space-y-2 sm:w-64">
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
                          return !isDateEnabledForAttendance(
                            date,
                            attendanceDateSets,
                          );
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
                <div className="w-full space-y-2 sm:w-64">
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
                      const nextSets = buildAttendanceDateSets({
                        classId: nextClassId,
                        slots: scheduleSlotList,
                        events: calendarEvents.map((calendarEvent) => ({
                          event_type: calendarEvent.event_type,
                          class_id: calendarEvent.class_id,
                          event_date: calendarEvent.event_date,
                          start_time: calendarEvent.start_time,
                        })),
                        attendance: attendanceRecords.map((record) => ({
                          classId: record.classId,
                          attendanceDate: record.attendanceDate,
                        })),
                      });
                      if (
                        nextSets.scheduleWeekdays.size === 0 &&
                        nextSets.extraSessionDates.size === 0 &&
                        nextSets.datesWithAttendance.size === 0
                      ) {
                        setAttendanceDateError(
                          "This class has no scheduled days yet.",
                        );
                        return;
                      }
                      if (!isDateEnabledForAttendance(attendanceDate, nextSets)) {
                        const nextDate = findNextEnabledDate(
                          attendanceDate,
                          nextSets,
                        );
                        setAttendanceDate(nextDate);
                        setAttendanceDateError("");
                      }
                    }}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="">All students</option>
                    {activeClasses.map((classItem) => (
                      <option key={classItem.id} value={classItem.id}>
                        {classItem.name}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="pb-2 text-xs text-muted-foreground">
                  Pick a class to filter the roster. Attendance is saved
                  automatically for the selected class and date.
                </p>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card">
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
              <div className="text-sm font-semibold">
                Roster{" "}
                <span className="font-normal text-muted-foreground">
                  · {attendanceRoster.length}
                </span>
              </div>
              <div className="text-xs text-muted-foreground">
                {format(attendanceDate, "PPP")}
              </div>
            </div>
                {!attendanceClassId ? (
                  <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                    Select a class to view its assigned students.
                  </p>
                ) : attendanceRoster.length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                    No students assigned to this class yet.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Student</TableHead>
                        <TableHead>Grade</TableHead>
                        <TableHead className="text-right">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                    {attendanceRoster.map((student) => {
                      const status =
                        attendanceStatusByStudent[student.id] ?? "";

                      return (
                        <TableRow key={student.id}>
                          <TableCell>
                            <div className="font-medium">
                              {student.firstName} {student.lastName}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {student.email || "No email"}
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {student.gradeLevel || "N/A"}
                          </TableCell>
                          <TableCell>
                          <div className="flex flex-wrap justify-end gap-2">
                            <Button
                              type="button"
                              variant={
                                status === "present" ? "default" : "outline"
                              }
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
                                  className: attendanceClassName,
                                  studentId: student.id,
                                  attendanceDate: attendanceDateKey,
                                  status: nextStatus,
                                });
                                updateAttendanceRecords(
                                  student.id,
                                  nextStatus as
                                    | "present"
                                    | "late"
                                    | "absent"
                                    | "",
                                );
                              }}
                            >
                              Present
                            </Button>
                            <Button
                              type="button"
                              variant={
                                status === "late" ? "default" : "outline"
                              }
                              size="sm"
                              onClick={async () => {
                                if (!attendanceClassId) {
                                  return;
                                }
                                const nextStatus =
                                  status === "late" ? "" : "late";
                                setAttendanceStatusByStudent((prev) => ({
                                  ...prev,
                                  [student.id]: nextStatus,
                                }));
                                await setAttendanceAction({
                                  classId: attendanceClassId,
                                  className: attendanceClassName,
                                  studentId: student.id,
                                  attendanceDate: attendanceDateKey,
                                  status: nextStatus,
                                });
                                updateAttendanceRecords(
                                  student.id,
                                  nextStatus as
                                    | "present"
                                    | "late"
                                    | "absent"
                                    | "",
                                );
                              }}
                            >
                              Late
                            </Button>
                            <Button
                              type="button"
                              variant={
                                status === "absent" ? "destructive" : "outline"
                              }
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
                                  className: attendanceClassName,
                                  studentId: student.id,
                                  attendanceDate: attendanceDateKey,
                                  status: nextStatus,
                                });
                                updateAttendanceRecords(
                                  student.id,
                                  nextStatus as
                                    | "present"
                                    | "late"
                                    | "absent"
                                    | "",
                                );
                              }}
                            >
                              Absent
                            </Button>
                          </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    </TableBody>
                  </Table>
                )}
          </div>
        </TabsContent>

        <TabsContent value="quizzes" className="mt-0">
          <TeacherQuizBuilder
            classes={activeClasses.map(({ id, name }) => ({ id, name }))}
            initialQuizzes={initialQuizzes}
          />
        </TabsContent>

        <TabsContent value="billing" className="mt-0">
          <TeacherBilling
            initialFamilyBalances={initialFamilyBalances}
            initialChargeRuns={initialChargeRuns}
          />
        </TabsContent>

        <TabsContent value="receipts" className="mt-0">
          <TeacherReceipts
            initialReceipts={initialReceipts}
            families={initialFamilies}
            business={businessProfile}
          />
        </TabsContent>

        <TabsContent value="expenses" className="mt-0">
          <TeacherExpenses initialExpenses={initialExpenses} />
        </TabsContent>

        <TabsContent value="business" className="mt-0">
          <TeacherBusinessSettings
            initialProfile={businessProfile}
            initialIntegrations={integrationSettings}
            initialCredentialStatuses={credentialStatuses}
          />
        </TabsContent>
          </main>
        </div>
      </Tabs>
    </div>
  );
}

"use client";

import * as React from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  ArrowLeftIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
  UserPlusIcon,
} from "lucide-react";

import {
  addStudentToAssessmentAction,
  clearAssessmentMarkAction,
  createAssessmentAction,
  deleteAssessmentAction,
  editAssessmentAssignmentScheduleAction,
  enterAssessmentMarkAction,
  markAssessmentTakenAction,
  removeStudentFromAssessmentAction,
  updateAssessmentAction,
} from "@/app/protected/teacher/assessments-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { AssessmentStatusBadge } from "@/components/assessment-status-badge";
import { fromIsoDate } from "@/lib/calendar-projection";
import { upsertAssessmentAssignment } from "@/lib/assessment-status";
import type {
  TeacherAssessmentAssignmentRow,
  TeacherAssessmentListItem,
  AssessmentInput,
  AssessmentKind,
} from "@/lib/types/database";

type ClassOption = { id: string; name: string };
type StudentOption = { id: string; firstName: string; lastName: string };

const KIND_LABELS: Record<AssessmentKind, string> = {
  short_assessment: "Short assessment",
  mock_exam: "Mock exam",
};

function toDatetimeLocalValue(iso: string): string {
  return format(new Date(iso), "yyyy-MM-dd'T'HH:mm");
}

function formatDateLabel(iso: string): string {
  return format(fromIsoDate(iso), "d MMM yyyy");
}

function scheduleSummary(input: {
  kind: AssessmentKind;
  scheduledDate: string | null;
  scheduledTime: string | null;
  deadlineAt: string | null;
}): string {
  if (input.kind === "mock_exam") {
    if (!input.scheduledDate) return "No date set";
    return input.scheduledTime
      ? `${formatDateLabel(input.scheduledDate)} at ${input.scheduledTime}`
      : formatDateLabel(input.scheduledDate);
  }
  return input.deadlineAt
    ? `Due ${format(new Date(input.deadlineAt), "d MMM yyyy, HH:mm")}`
    : "Open (no deadline)";
}

type AssessmentFormState = {
  kind: AssessmentKind;
  title: string;
  description: string;
  maxScore: string;
  durationMinutes: string;
  scheduledDate: string;
  scheduledTime: string;
  hasDeadline: boolean;
  deadlineLocal: string;
  targetType: "class" | "students";
  classId: string;
  studentIds: string[];
};

function emptyForm(): AssessmentFormState {
  return {
    kind: "short_assessment",
    title: "",
    description: "",
    maxScore: "20",
    durationMinutes: "45",
    scheduledDate: "",
    scheduledTime: "",
    hasDeadline: false,
    deadlineLocal: "",
    targetType: "class",
    classId: "",
    studentIds: [],
  };
}

function assessmentToForm(
  assessment: TeacherAssessmentListItem,
): AssessmentFormState {
  return {
    kind: assessment.kind,
    title: assessment.title,
    description: assessment.description ?? "",
    maxScore: String(assessment.max_score),
    durationMinutes: String(assessment.duration_minutes),
    scheduledDate: assessment.scheduled_date ?? "",
    scheduledTime: assessment.scheduled_time ?? "",
    hasDeadline: Boolean(assessment.deadline_at),
    deadlineLocal: assessment.deadline_at
      ? toDatetimeLocalValue(assessment.deadline_at)
      : "",
    targetType: "class",
    classId: assessment.class_id ?? "",
    studentIds: [],
  };
}

function formToInput(form: AssessmentFormState): AssessmentInput {
  return {
    kind: form.kind,
    title: form.title,
    description: form.description || undefined,
    maxScore: Number(form.maxScore),
    durationMinutes: Number(form.durationMinutes),
    scheduledDate: form.kind === "mock_exam" ? form.scheduledDate || undefined : undefined,
    scheduledTime:
      form.kind === "mock_exam" ? form.scheduledTime || undefined : undefined,
    deadlineAt:
      form.kind === "short_assessment" && form.hasDeadline && form.deadlineLocal
        ? new Date(form.deadlineLocal).toISOString()
        : null,
    classId: form.targetType === "class" ? form.classId || undefined : undefined,
    studentIds: form.targetType === "students" ? form.studentIds : undefined,
  };
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function TeacherAssessments({
  classes,
  students,
  assessments,
  assessmentAssignments,
  onAssessmentsChange,
  onAssessmentAssignmentsChange,
  selectedAssessmentId,
  onSelectedAssessmentIdChange,
}: {
  classes: ClassOption[];
  students: StudentOption[];
  assessments: TeacherAssessmentListItem[];
  assessmentAssignments: TeacherAssessmentAssignmentRow[];
  onAssessmentsChange: React.Dispatch<
    React.SetStateAction<TeacherAssessmentListItem[]>
  >;
  onAssessmentAssignmentsChange: React.Dispatch<
    React.SetStateAction<TeacherAssessmentAssignmentRow[]>
  >;
  selectedAssessmentId: string | null;
  onSelectedAssessmentIdChange: (assessmentId: string | null) => void;
}) {
  const [dialog, setDialog] = React.useState<
    | { mode: "create" }
    | { mode: "edit"; assessment: TeacherAssessmentListItem }
    | null
  >(null);
  const [form, setForm] = React.useState<AssessmentFormState>(emptyForm());
  const [isSaving, setIsSaving] = React.useState(false);
  const [addStudentId, setAddStudentId] = React.useState("");
  const [scheduleTarget, setScheduleTarget] =
    React.useState<TeacherAssessmentAssignmentRow | null>(null);
  const [markTarget, setMarkTarget] = React.useState<{
    assignment: TeacherAssessmentAssignmentRow;
    maxScore: number;
  } | null>(null);

  const summaryByAssessment = React.useMemo(() => {
    const map = new Map<
      string,
      { count: number; marked: number; late: number }
    >();
    for (const assignment of assessmentAssignments) {
      const entry = map.get(assignment.assessment_id) ?? {
        count: 0,
        marked: 0,
        late: 0,
      };
      entry.count += 1;
      if (assignment.status === "marked") entry.marked += 1;
      if (assignment.isLate) entry.late += 1;
      map.set(assignment.assessment_id, entry);
    }
    return map;
  }, [assessmentAssignments]);

  const selectedAssessment = selectedAssessmentId
    ? assessments.find((a) => a.id === selectedAssessmentId) ?? null
    : null;

  function openCreateDialog() {
    setForm(emptyForm());
    setDialog({ mode: "create" });
  }

  function openEditDialog(assessment: TeacherAssessmentListItem) {
    setForm(assessmentToForm(assessment));
    setDialog({ mode: "edit", assessment });
  }

  function toggleStudentId(id: string) {
    setForm((prev) => ({
      ...prev,
      studentIds: prev.studentIds.includes(id)
        ? prev.studentIds.filter((s) => s !== id)
        : [...prev.studentIds, id],
    }));
  }

  async function handleSubmitForm(event: React.FormEvent) {
    event.preventDefault();
    setIsSaving(true);
    try {
      const input = formToInput(form);
      if (dialog?.mode === "edit") {
        const updated = await updateAssessmentAction(
          dialog.assessment.id,
          input,
        );
        onAssessmentsChange((prev) =>
          prev.map((a) => (a.id === updated.id ? { ...a, ...updated } : a)),
        );
        toast.success("Assessment updated");
      } else {
        const { assessment, assignments } = await createAssessmentAction(input);
        onAssessmentsChange((prev) => [
          { ...assessment, assignmentCount: assignments.length, markedCount: 0 },
          ...prev,
        ]);
        onAssessmentAssignmentsChange((prev) => [...assignments, ...prev]);
        toast.success("Assessment created");
        onSelectedAssessmentIdChange(assessment.id);
      }
      setDialog(null);
    } catch (error) {
      toast.error(errorMessage(error, "Failed to save the assessment"));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteAssessment(assessment: TeacherAssessmentListItem) {
    if (
      !window.confirm(
        `Delete "${assessment.title}"? This removes every student's record for it.`,
      )
    ) {
      return;
    }
    try {
      await deleteAssessmentAction(assessment.id);
      onAssessmentsChange((prev) => prev.filter((a) => a.id !== assessment.id));
      onAssessmentAssignmentsChange((prev) =>
        prev.filter((a) => a.assessment_id !== assessment.id),
      );
      if (selectedAssessmentId === assessment.id) {
        onSelectedAssessmentIdChange(null);
      }
      toast.success("Assessment deleted");
    } catch (error) {
      toast.error(errorMessage(error, "Failed to delete the assessment"));
    }
  }

  async function handleAddStudent(assessmentId: string) {
    if (!addStudentId) return;
    try {
      const assignment = await addStudentToAssessmentAction(
        assessmentId,
        addStudentId,
      );
      onAssessmentAssignmentsChange((prev) =>
        upsertAssessmentAssignment(prev, assignment),
      );
      setAddStudentId("");
      toast.success("Student added");
    } catch (error) {
      toast.error(errorMessage(error, "Failed to add the student"));
    }
  }

  async function handleRemoveStudent(
    assignment: TeacherAssessmentAssignmentRow,
  ) {
    if (
      !window.confirm(
        `Remove ${assignment.studentName} from this assessment?`,
      )
    ) {
      return;
    }
    try {
      await removeStudentFromAssessmentAction(assignment.id);
      onAssessmentAssignmentsChange((prev) =>
        prev.filter((a) => a.id !== assignment.id),
      );
      toast.success("Removed");
    } catch (error) {
      toast.error(errorMessage(error, "Failed to remove the student"));
    }
  }

  async function handleMarkTaken(assignment: TeacherAssessmentAssignmentRow) {
    try {
      const updated = await markAssessmentTakenAction(assignment.id);
      onAssessmentAssignmentsChange((prev) =>
        upsertAssessmentAssignment(prev, updated),
      );
      toast.success("Marked taken");
    } catch (error) {
      toast.error(errorMessage(error, "Failed to mark taken"));
    }
  }

  async function handleClearMark(assignment: TeacherAssessmentAssignmentRow) {
    try {
      const updated = await clearAssessmentMarkAction(assignment.id);
      onAssessmentAssignmentsChange((prev) =>
        upsertAssessmentAssignment(prev, updated),
      );
      toast.success("Mark cleared");
    } catch (error) {
      toast.error(errorMessage(error, "Failed to clear the mark"));
    }
  }

  return (
    <div className="space-y-6">
      {selectedAssessment ? (
        <AssessmentDetailView
          assessment={selectedAssessment}
          assignments={assessmentAssignments.filter(
            (a) => a.assessment_id === selectedAssessment.id,
          )}
          studentOptions={students.filter(
            (s) =>
              !assessmentAssignments.some(
                (a) =>
                  a.assessment_id === selectedAssessment.id &&
                  a.student_id === s.id,
              ),
          )}
          addStudentId={addStudentId}
          onAddStudentIdChange={setAddStudentId}
          onBack={() => onSelectedAssessmentIdChange(null)}
          onEdit={() => openEditDialog(selectedAssessment)}
          onDelete={() => void handleDeleteAssessment(selectedAssessment)}
          onAddStudent={() => void handleAddStudent(selectedAssessment.id)}
          onRemoveStudent={(a) => void handleRemoveStudent(a)}
          onEditSchedule={(a) => setScheduleTarget(a)}
          onMarkTaken={(a) => void handleMarkTaken(a)}
          onEnterMark={(a) =>
            setMarkTarget({
              assignment: a,
              maxScore: selectedAssessment.max_score,
            })
          }
          onClearMark={(a) => void handleClearMark(a)}
        />
      ) : (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle>Assessments</CardTitle>
            <Button size="sm" onClick={openCreateDialog}>
              <PlusIcon className="mr-1.5 h-4 w-4" />
              New assessment
            </Button>
          </CardHeader>
          <CardContent>
            {assessments.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No assessments registered yet.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Assessment</TableHead>
                    <TableHead>Assigned to</TableHead>
                    <TableHead>When</TableHead>
                    <TableHead>Progress</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assessments.map((assessment) => {
                    const summary = summaryByAssessment.get(assessment.id) ?? {
                      count: 0,
                      marked: 0,
                      late: 0,
                    };
                    return (
                      <TableRow
                        key={assessment.id}
                        className="cursor-pointer"
                        onClick={() => onSelectedAssessmentIdChange(assessment.id)}
                      >
                        <TableCell>
                          <div className="font-medium">{assessment.title}</div>
                          <div className="text-xs text-muted-foreground">
                            <Badge variant="outline" className="mr-1.5">
                              {KIND_LABELS[assessment.kind]}
                            </Badge>
                            out of {assessment.max_score}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          {assessment.class_name ?? `${summary.count} student(s)`}
                        </TableCell>
                        <TableCell className="text-sm">
                          {scheduleSummary({
                            kind: assessment.kind,
                            scheduledDate: assessment.scheduled_date,
                            scheduledTime: assessment.scheduled_time,
                            deadlineAt: assessment.deadline_at,
                          })}
                        </TableCell>
                        <TableCell className="text-sm">
                          <div>
                            {summary.marked}/{summary.count} marked
                          </div>
                          {summary.late > 0 ? (
                            <Badge variant="destructive" className="mt-1">
                              {summary.late} late
                            </Badge>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog
        open={dialog !== null}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {dialog?.mode === "edit" ? "Edit assessment" : "New assessment"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmitForm} className="space-y-4">
            <div className="space-y-2">
              <Label>Kind</Label>
              <RadioGroup
                value={form.kind}
                onValueChange={(value) =>
                  setForm((prev) => ({
                    ...prev,
                    kind: value as AssessmentKind,
                    durationMinutes: value === "mock_exam" ? "120" : "45",
                  }))
                }
                className="flex gap-4"
                disabled={dialog?.mode === "edit"}
              >
                <label className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value="short_assessment" />
                  Short assessment (≤ 1h)
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value="mock_exam" />
                  Mock exam (1-3h)
                </label>
              </RadioGroup>
            </div>

            <div className="space-y-2">
              <Label htmlFor="assessment-title">Title</Label>
              <Input
                id="assessment-title"
                value={form.title}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, title: e.target.value }))
                }
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="assessment-description">
                Description (optional)
              </Label>
              <Textarea
                id="assessment-description"
                value={form.description}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, description: e.target.value }))
                }
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="assessment-max-score">Max score</Label>
                <Input
                  id="assessment-max-score"
                  type="number"
                  min={1}
                  step="0.01"
                  value={form.maxScore}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, maxScore: e.target.value }))
                  }
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="assessment-duration">Duration (minutes)</Label>
                <Input
                  id="assessment-duration"
                  type="number"
                  min={1}
                  max={form.kind === "short_assessment" ? 60 : 180}
                  value={form.durationMinutes}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      durationMinutes: e.target.value,
                    }))
                  }
                  required
                />
                <p className="text-xs text-muted-foreground">
                  {form.kind === "short_assessment"
                    ? "1-60 minutes"
                    : "60-180 minutes"}
                </p>
              </div>
            </div>

            {form.kind === "mock_exam" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="assessment-scheduled-date">Exam date</Label>
                  <Input
                    id="assessment-scheduled-date"
                    type="date"
                    value={form.scheduledDate}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        scheduledDate: e.target.value,
                      }))
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="assessment-scheduled-time">
                    Time (optional)
                  </Label>
                  <Input
                    id="assessment-scheduled-time"
                    type="time"
                    value={form.scheduledTime}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        scheduledTime: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="assessment-has-deadline"
                    checked={form.hasDeadline}
                    onCheckedChange={(checked) =>
                      setForm((prev) => ({
                        ...prev,
                        hasDeadline: checked === true,
                      }))
                    }
                  />
                  <Label htmlFor="assessment-has-deadline" className="font-normal">
                    Set a deadline (otherwise open, no deadline)
                  </Label>
                </div>
                {form.hasDeadline ? (
                  <Input
                    type="datetime-local"
                    value={form.deadlineLocal}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        deadlineLocal: e.target.value,
                      }))
                    }
                    required
                  />
                ) : null}
              </div>
            )}

            {dialog?.mode !== "edit" ? (
              <div className="space-y-2">
                <Label>Assign to</Label>
                <RadioGroup
                  value={form.targetType}
                  onValueChange={(value) =>
                    setForm((prev) => ({
                      ...prev,
                      targetType: value as "class" | "students",
                    }))
                  }
                  className="flex gap-4"
                >
                  <label className="flex items-center gap-2 text-sm">
                    <RadioGroupItem value="class" />
                    Whole class
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <RadioGroupItem value="students" />
                    Individual students
                  </label>
                </RadioGroup>

                {form.targetType === "class" ? (
                  <select
                    value={form.classId}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, classId: e.target.value }))
                    }
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="">Choose a class</option>
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="grid max-h-48 gap-2 overflow-y-auto">
                    {students.map((student) => (
                      <label
                        key={student.id}
                        className="flex items-center gap-3 rounded-md border p-2 text-sm"
                      >
                        <Checkbox
                          checked={form.studentIds.includes(student.id)}
                          onCheckedChange={() => toggleStudentId(student.id)}
                        />
                        <span className="flex-1">
                          {student.firstName} {student.lastName}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            ) : null}

            <DialogFooter>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ScheduleEditDialog
        assignment={scheduleTarget}
        onClose={() => setScheduleTarget(null)}
        onSaved={(updated) => {
          onAssessmentAssignmentsChange((prev) =>
            upsertAssessmentAssignment(prev, updated),
          );
          setScheduleTarget(null);
        }}
      />

      <MarkEntryDialog
        target={markTarget}
        onClose={() => setMarkTarget(null)}
        onSaved={(updated) => {
          onAssessmentAssignmentsChange((prev) =>
            upsertAssessmentAssignment(prev, updated),
          );
          setMarkTarget(null);
        }}
      />
    </div>
  );
}

function AssessmentDetailView({
  assessment,
  assignments,
  studentOptions,
  addStudentId,
  onAddStudentIdChange,
  onBack,
  onEdit,
  onDelete,
  onAddStudent,
  onRemoveStudent,
  onEditSchedule,
  onMarkTaken,
  onEnterMark,
  onClearMark,
}: {
  assessment: TeacherAssessmentListItem;
  assignments: TeacherAssessmentAssignmentRow[];
  studentOptions: StudentOption[];
  addStudentId: string;
  onAddStudentIdChange: (id: string) => void;
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onAddStudent: () => void;
  onRemoveStudent: (assignment: TeacherAssessmentAssignmentRow) => void;
  onEditSchedule: (assignment: TeacherAssessmentAssignmentRow) => void;
  onMarkTaken: (assignment: TeacherAssessmentAssignmentRow) => void;
  onEnterMark: (assignment: TeacherAssessmentAssignmentRow) => void;
  onClearMark: (assignment: TeacherAssessmentAssignmentRow) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeftIcon className="mr-1.5 h-4 w-4" />
          Back to assessments
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onEdit}>
            <PencilIcon className="mr-1.5 h-4 w-4" />
            Edit
          </Button>
          <Button variant="destructive" size="sm" onClick={onDelete}>
            <Trash2Icon className="mr-1.5 h-4 w-4" />
            Delete
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {assessment.title}
            <Badge variant="outline">{KIND_LABELS[assessment.kind]}</Badge>
          </CardTitle>
          {assessment.description ? (
            <p className="text-sm text-muted-foreground">
              {assessment.description}
            </p>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm text-muted-foreground">
            {assessment.class_name ? `Class: ${assessment.class_name} • ` : ""}
            Out of {assessment.max_score} • {assessment.duration_minutes} min •{" "}
            {scheduleSummary({
              kind: assessment.kind,
              scheduledDate: assessment.scheduled_date,
              scheduledTime: assessment.scheduled_time,
              deadlineAt: assessment.deadline_at,
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={addStudentId}
              onChange={(e) => onAddStudentIdChange(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Add a student…</option>
              {studentOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.firstName} {s.lastName}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              variant="outline"
              disabled={!addStudentId}
              onClick={onAddStudent}
            >
              <UserPlusIcon className="mr-1.5 h-4 w-4" />
              Add
            </Button>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>Schedule</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Mark</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {assignments.map((assignment) => (
                <TableRow key={assignment.id}>
                  <TableCell>{assignment.studentName}</TableCell>
                  <TableCell className="text-sm">
                    <button
                      type="button"
                      className="text-left underline decoration-dotted underline-offset-2"
                      onClick={() => onEditSchedule(assignment)}
                    >
                      {scheduleSummary({
                        kind: assignment.kind,
                        scheduledDate: assignment.effective_scheduled_date,
                        scheduledTime: assignment.effective_scheduled_time,
                        deadlineAt: assignment.effective_deadline_at,
                      })}
                    </button>
                  </TableCell>
                  <TableCell>
                    <AssessmentStatusBadge
                      status={assignment.status}
                      isLate={assignment.isLate}
                    />
                  </TableCell>
                  <TableCell className="text-sm">
                    {assignment.status === "marked" ? (
                      <div>
                        <div className="font-medium">
                          {assignment.score}/{assessment.max_score}
                        </div>
                        {assignment.teacher_comment ? (
                          <div className="text-xs text-muted-foreground">
                            {assignment.teacher_comment}
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="space-x-2 text-right whitespace-nowrap">
                    {assignment.status === "registered" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onMarkTaken(assignment)}
                      >
                        Mark taken
                      </Button>
                    ) : null}
                    {assignment.status === "taken" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onEnterMark(assignment)}
                      >
                        Enter mark
                      </Button>
                    ) : null}
                    {assignment.status === "marked" ? (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onEnterMark(assignment)}
                        >
                          Edit mark
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => onClearMark(assignment)}
                        >
                          Clear mark
                        </Button>
                      </>
                    ) : null}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onRemoveStudent(assignment)}
                    >
                      Remove
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// Split into a wrapper (owns the Dialog's open state) and a form keyed by
// assignment id, rather than a useEffect syncing form state from the
// `assignment` prop - remounting via `key` when the target changes is the
// React-recommended way to reset state from a prop, and avoids the
// cascading-render footgun a setState-in-effect has.
function ScheduleEditDialog({
  assignment,
  onClose,
  onSaved,
}: {
  assignment: TeacherAssessmentAssignmentRow | null;
  onClose: () => void;
  onSaved: (updated: TeacherAssessmentAssignmentRow) => void;
}) {
  return (
    <Dialog
      open={assignment !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{assignment?.studentName}&apos;s schedule</DialogTitle>
        </DialogHeader>
        {assignment ? (
          <ScheduleEditForm
            key={assignment.id}
            assignment={assignment}
            onSaved={onSaved}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function ScheduleEditForm({
  assignment,
  onSaved,
}: {
  assignment: TeacherAssessmentAssignmentRow;
  onSaved: (updated: TeacherAssessmentAssignmentRow) => void;
}) {
  const [scheduledDate, setScheduledDate] = React.useState(
    assignment.effective_scheduled_date ?? "",
  );
  const [scheduledTime, setScheduledTime] = React.useState(
    assignment.effective_scheduled_time ?? "",
  );
  const [hasDeadline, setHasDeadline] = React.useState(
    Boolean(assignment.effective_deadline_at),
  );
  const [deadlineLocal, setDeadlineLocal] = React.useState(
    assignment.effective_deadline_at
      ? toDatetimeLocalValue(assignment.effective_deadline_at)
      : "",
  );
  const [isSaving, setIsSaving] = React.useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setIsSaving(true);
    try {
      const updated = await editAssessmentAssignmentScheduleAction(
        assignment.id,
        {
          scheduledDate:
            assignment.kind === "mock_exam" ? scheduledDate : undefined,
          scheduledTime:
            assignment.kind === "mock_exam" ? scheduledTime || undefined : undefined,
          deadlineAt:
            assignment.kind === "short_assessment" && hasDeadline && deadlineLocal
              ? new Date(deadlineLocal).toISOString()
              : null,
        },
      );
      onSaved(updated);
      toast.success("Schedule updated");
    } catch (error) {
      toast.error(errorMessage(error, "Failed to update the schedule"));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {assignment.kind === "mock_exam" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="assignment-date">Exam date</Label>
            <Input
              id="assignment-date"
              type="date"
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="assignment-time">Time (optional)</Label>
            <Input
              id="assignment-time"
              type="time"
              value={scheduledTime}
              onChange={(e) => setScheduledTime(e.target.value)}
            />
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Checkbox
              id="assignment-has-deadline"
              checked={hasDeadline}
              onCheckedChange={(checked) => setHasDeadline(checked === true)}
            />
            <Label htmlFor="assignment-has-deadline" className="font-normal">
              Set a deadline (otherwise open, no deadline)
            </Label>
          </div>
          {hasDeadline ? (
            <Input
              type="datetime-local"
              value={deadlineLocal}
              onChange={(e) => setDeadlineLocal(e.target.value)}
              required
            />
          ) : null}
        </div>
      )}
      <DialogFooter>
        <Button type="submit" disabled={isSaving}>
          {isSaving ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function MarkEntryDialog({
  target,
  onClose,
  onSaved,
}: {
  target: {
    assignment: TeacherAssessmentAssignmentRow;
    maxScore: number;
  } | null;
  onClose: () => void;
  onSaved: (updated: TeacherAssessmentAssignmentRow) => void;
}) {
  return (
    <Dialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{target?.assignment.studentName}&apos;s mark</DialogTitle>
        </DialogHeader>
        {target ? (
          <MarkEntryForm
            key={target.assignment.id}
            assignment={target.assignment}
            maxScore={target.maxScore}
            onSaved={onSaved}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function MarkEntryForm({
  assignment,
  maxScore,
  onSaved,
}: {
  assignment: TeacherAssessmentAssignmentRow;
  maxScore: number;
  onSaved: (updated: TeacherAssessmentAssignmentRow) => void;
}) {
  const [score, setScore] = React.useState(
    assignment.score !== null ? String(assignment.score) : "",
  );
  const [comment, setComment] = React.useState(assignment.teacher_comment ?? "");
  const [takenAtLocal, setTakenAtLocal] = React.useState(
    assignment.taken_at
      ? toDatetimeLocalValue(assignment.taken_at)
      : toDatetimeLocalValue(new Date().toISOString()),
  );
  const [isSaving, setIsSaving] = React.useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setIsSaving(true);
    try {
      const updated = await enterAssessmentMarkAction(assignment.id, {
        score: Number(score),
        teacherComment: comment || undefined,
        takenAt: takenAtLocal ? new Date(takenAtLocal).toISOString() : undefined,
      });
      onSaved(updated);
      toast.success("Mark saved");
    } catch (error) {
      toast.error(errorMessage(error, "Failed to save the mark"));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="mark-score">Score (out of {maxScore})</Label>
        <Input
          id="mark-score"
          type="number"
          min={0}
          max={maxScore}
          step="0.01"
          value={score}
          onChange={(e) => setScore(e.target.value)}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="mark-taken-at">Taken on</Label>
        <Input
          id="mark-taken-at"
          type="datetime-local"
          value={takenAtLocal}
          onChange={(e) => setTakenAtLocal(e.target.value)}
          disabled={assignment.taken_at !== null}
        />
        {assignment.taken_at !== null ? (
          <p className="text-xs text-muted-foreground">
            Already recorded as taken - this can&apos;t be changed here.
          </p>
        ) : null}
      </div>
      <div className="space-y-2">
        <Label htmlFor="mark-comment">Comment (optional)</Label>
        <Textarea
          id="mark-comment"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
      </div>
      <DialogFooter>
        <Button type="submit" disabled={isSaving}>
          {isSaving ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </form>
  );
}

"use client";

import * as React from "react";
import {
  ArchiveIcon,
  PencilIcon,
  RotateCcwIcon,
  Trash2Icon,
  UserPlusIcon,
  XIcon,
} from "lucide-react";

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
import { MathText } from "@/components/math-text";
import { CLASS_GRADE_LABELS } from "@/lib/class-grades";
import type { TeacherQuizListItem } from "@/lib/types/database";

const DAY_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

type ClassItem = {
  id: string;
  name: string;
  hoursPerWeek: number;
  grade: string | null;
  color: string;
  archivedAt: string | null;
};

type StudentItem = {
  id: string;
  firstName: string;
  lastName: string;
  gradeLevel: string;
  tuitionStatus: "current" | "past-due" | "scholarship";
};

type TeacherClassDetailProps = {
  classItem: ClassItem;
  scheduledSlots: { day: string; time: string }[];
  enrolledStudents: StudentItem[];
  allStudents: StudentItem[];
  assignedQuizzes: TeacherQuizListItem[];
  isSavingClass: boolean;
  isMutatingEnrollment: boolean;
  onBack: () => void;
  onEdit: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onDelete: () => void;
  onViewStudent: (studentId: string) => void;
  onGoToQuizzes: () => void;
  onEnrollStudent: (studentId: string) => void;
  onUnenrollStudent: (studentId: string) => void;
};

export function TeacherClassDetail({
  classItem,
  scheduledSlots,
  enrolledStudents,
  allStudents,
  assignedQuizzes,
  isSavingClass,
  isMutatingEnrollment,
  onBack,
  onEdit,
  onArchive,
  onRestore,
  onDelete,
  onViewStudent,
  onGoToQuizzes,
  onEnrollStudent,
  onUnenrollStudent,
}: TeacherClassDetailProps) {
  const [isManageStudentsOpen, setIsManageStudentsOpen] = React.useState(false);
  const enrolledIds = new Set(enrolledStudents.map((student) => student.id));
  const sortedSlots = [...scheduledSlots].sort((a, b) => {
    const dayDiff = DAY_ORDER.indexOf(a.day as (typeof DAY_ORDER)[number]) -
      DAY_ORDER.indexOf(b.day as (typeof DAY_ORDER)[number]);
    return dayDiff !== 0 ? dayDiff : a.time.localeCompare(b.time);
  });

  return (
    <div className="animate-in fade-in slide-in-from-right-8 duration-300">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <span
                className={
                  "inline-block size-2.5 shrink-0 rounded-full border " +
                  classItem.color
                }
                aria-hidden="true"
              />
              {classItem.name}
              {classItem.archivedAt ? (
                <Badge variant="secondary">Archived</Badge>
              ) : (
                <Badge variant="outline">Active</Badge>
              )}
            </CardTitle>
            <div className="text-sm text-muted-foreground">
              {classItem.hoursPerWeek} hours/week &middot;{" "}
              {sortedSlots.length} of {classItem.hoursPerWeek} slots scheduled
              {classItem.grade
                ? ` · ${CLASS_GRADE_LABELS[classItem.grade] ?? classItem.grade}`
                : ""}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onEdit}
              disabled={isSavingClass}
            >
              <PencilIcon className="mr-1 h-3.5 w-3.5" /> Edit
            </Button>
            {classItem.archivedAt ? (
              <Button
                type="button"
                variant="outline"
                onClick={onRestore}
                disabled={isSavingClass}
              >
                <RotateCcwIcon className="mr-1 h-3.5 w-3.5" /> Restore
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                onClick={onArchive}
                disabled={isSavingClass}
              >
                <ArchiveIcon className="mr-1 h-3.5 w-3.5" /> Archive
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={onDelete}
              disabled={isSavingClass}
            >
              <Trash2Icon className="mr-1 h-3.5 w-3.5" /> Delete
            </Button>
            <Button type="button" variant="outline" onClick={onBack}>
              Back to classes
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-4">
            <div className="rounded-lg border p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Enrolled students
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsManageStudentsOpen(true)}
                >
                  <UserPlusIcon className="mr-1 h-3.5 w-3.5" /> Enroll
                  students
                </Button>
              </div>
              <div className="mt-3 space-y-2">
                {enrolledStudents.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No students enrolled in this class.
                  </p>
                ) : (
                  enrolledStudents.map((student) => (
                    <div
                      key={student.id}
                      className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm"
                    >
                      <button
                        type="button"
                        onClick={() => onViewStudent(student.id)}
                        className="flex flex-1 items-center justify-between gap-2 text-left hover:underline"
                      >
                        <span className="font-medium">
                          {student.firstName} {student.lastName}
                        </span>
                        <span className="flex items-center gap-2 text-xs text-muted-foreground">
                          Grade {student.gradeLevel || "N/A"}
                          <Badge variant="outline">
                            {student.tuitionStatus.replace("-", " ")}
                          </Badge>
                        </span>
                      </button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="ml-2 h-7 w-7 shrink-0 p-0"
                        disabled={isMutatingEnrollment}
                        onClick={(event) => {
                          event.stopPropagation();
                          onUnenrollStudent(student.id);
                        }}
                        aria-label={`Remove ${student.firstName} ${student.lastName} from this class`}
                      >
                        <XIcon className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-lg border p-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Schedule
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {sortedSlots.length === 0 ? (
                  <span className="text-xs text-muted-foreground">
                    Not yet scheduled.
                  </span>
                ) : (
                  sortedSlots.map((slot) => (
                    <Badge key={`${slot.day}-${slot.time}`} variant="outline">
                      {slot.day} &middot; {slot.time}
                    </Badge>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-lg border p-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Assigned quizzes
              </div>
              <div className="mt-3 space-y-2">
                {assignedQuizzes.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No quizzes assigned to this class.
                  </p>
                ) : (
                  assignedQuizzes.map((quiz) => (
                    <div
                      key={quiz.id}
                      className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                    >
                      <span className="font-medium">
                        <MathText text={quiz.title} />
                      </span>
                      <span className="flex items-center gap-2 text-xs text-muted-foreground">
                        {quiz.hasAttempts && (
                          <Badge variant="secondary">Locked</Badge>
                        )}
                        {quiz.timeLimitMinutes !== null && (
                          <Badge variant="outline">
                            &#9201; {quiz.timeLimitMinutes} min
                          </Badge>
                        )}
                        <Badge variant="outline">
                          {quiz.questionCount} questions
                        </Badge>
                      </span>
                    </div>
                  ))
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={onGoToQuizzes}
                >
                  Go to Quizzes &rarr;
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={isManageStudentsOpen}
        onOpenChange={setIsManageStudentsOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enroll students — {classItem.name}</DialogTitle>
          </DialogHeader>
          <div className="grid max-h-[60vh] gap-2 overflow-y-auto">
            {allStudents.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No students on the roster yet.
              </p>
            ) : (
              allStudents.map((student) => {
                const isEnrolled = enrolledIds.has(student.id);
                return (
                  <label
                    key={student.id}
                    className="flex items-center gap-3 rounded-md border p-3 text-sm"
                  >
                    <Checkbox
                      checked={isEnrolled}
                      disabled={isMutatingEnrollment}
                      onCheckedChange={() =>
                        isEnrolled
                          ? onUnenrollStudent(student.id)
                          : onEnrollStudent(student.id)
                      }
                    />
                    <span className="flex-1">
                      {student.firstName} {student.lastName}
                    </span>
                  </label>
                );
              })
            )}
          </div>
          <DialogFooter showCloseButton />
        </DialogContent>
      </Dialog>
    </div>
  );
}

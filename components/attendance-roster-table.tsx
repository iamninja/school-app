"use client";

import { setAttendanceAction } from "@/app/protected/teacher/actions";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatEuro } from "@/lib/format-currency";
import type { AttendanceStatus } from "@/lib/attendance-records";

type RosterStudent = {
  id: string;
  firstName: string;
  lastName: string;
  gradeLevel: string;
  email: string;
};

/**
 * Present/Late/Absent/1+1 roster, shared by the Attendance tab (its own
 * class+date picker feeds this) and the Calendar tab's per-lesson attendance
 * section (a lesson's classId+date is already known there). Every click
 * follows the same two-step sequence the original inline version used:
 * an immediate optimistic update, then the server write, then a commit into
 * whichever canonical attendanceRecords list the caller owns.
 */
export function AttendanceRosterTable({
  roster,
  classId,
  className,
  dateKey,
  isTwoHour,
  isPerLesson,
  getStatus,
  getChargedAmount,
  onOptimisticChange,
  onCommitted,
}: {
  roster: RosterStudent[];
  classId: string;
  className: string;
  dateKey: string;
  isTwoHour: boolean;
  // True only for a per_lesson-billed class - renders the "€X charged"
  // hint so the teacher sees the billing consequence of the status they
  // set. The amount itself comes from getChargedAmount, not computed
  // from the class's current rate - a posted charge is frozen at
  // whatever rate was in effect when it was marked (see
  // post_lesson_charge_row()'s future-only repricing guard), so this can
  // legitimately disagree with today's rate.
  isPerLesson?: boolean;
  getStatus: (studentId: string) => AttendanceStatus | "";
  // The amount actually posted for this student's current mark, read
  // back from family_balance_transactions - null means nothing was
  // charged (absent, or not yet known before the first status set).
  getChargedAmount?: (studentId: string) => number | null;
  onOptimisticChange: (
    studentId: string,
    status: AttendanceStatus | "",
  ) => void;
  onCommitted: (
    studentId: string,
    status: AttendanceStatus | "",
    chargedAmount: number | null,
  ) => void;
}) {
  if (roster.length === 0) {
    return (
      <p className="px-4 py-8 text-center text-sm text-muted-foreground">
        No students assigned to this class yet.
      </p>
    );
  }

  const handleClick = async (
    studentId: string,
    status: AttendanceStatus | "",
  ) => {
    onOptimisticChange(studentId, status);
    const result = await setAttendanceAction({
      classId,
      className,
      studentId,
      attendanceDate: dateKey,
      status,
    });
    onCommitted(studentId, status, result.chargedAmount);
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Student</TableHead>
          <TableHead>Grade</TableHead>
          <TableHead className="text-right">Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {roster.map((student) => {
          const status = getStatus(student.id);

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
                <div className="flex flex-col items-end gap-1">
                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    type="button"
                    variant={status === "present" ? "default" : "outline"}
                    size="sm"
                    onClick={() =>
                      handleClick(
                        student.id,
                        status === "present" ? "" : "present",
                      )
                    }
                  >
                    Present
                  </Button>
                  <Button
                    type="button"
                    variant={status === "late" ? "default" : "outline"}
                    size="sm"
                    onClick={() =>
                      handleClick(student.id, status === "late" ? "" : "late")
                    }
                  >
                    Late
                  </Button>
                  <Button
                    type="button"
                    variant={status === "absent" ? "destructive" : "outline"}
                    size="sm"
                    onClick={() =>
                      handleClick(
                        student.id,
                        status === "absent" ? "" : "absent",
                      )
                    }
                  >
                    Absent
                  </Button>
                  {isTwoHour ? (
                    <Button
                      type="button"
                      variant={status === "split" ? "default" : "outline"}
                      size="sm"
                      title="One hour present, one hour absent"
                      onClick={() =>
                        handleClick(
                          student.id,
                          status === "split" ? "" : "split",
                        )
                      }
                    >
                      1+1
                    </Button>
                  ) : null}
                </div>
                {isPerLesson && status !== "" && (
                  <p className="text-xs text-muted-foreground">
                    {(() => {
                      const amount = getChargedAmount?.(student.id) ?? null;
                      return typeof amount === "number"
                        ? `${formatEuro(amount)} charged${status === "split" ? " (1+1)" : ""}`
                        : "Not charged";
                    })()}
                  </p>
                )}
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

// Shared between the Attendance tab (components/teacher-dashboard.tsx) and
// the Calendar tab's per-lesson attendance section
// (components/teacher-calendar.tsx) - both lift the same attendanceRecords
// state, so a status change made in either place is immediately reflected
// in the other.

export type AttendanceStatus = "present" | "late" | "absent" | "split";

export type AttendanceRecord = {
  studentId: string;
  classId: string | null;
  className: string;
  attendanceDate: string;
  status: AttendanceStatus;
};

/**
 * Replaces (or removes, when status is "") the one record matching
 * classId+studentId+attendanceDate, leaving every other record untouched.
 * Pure - callers own the setState call.
 */
export function upsertAttendanceRecord(
  records: AttendanceRecord[],
  args: {
    classId: string;
    className: string;
    studentId: string;
    attendanceDate: string;
    status: AttendanceStatus | "";
  },
): AttendanceRecord[] {
  const filtered = records.filter(
    (record) =>
      !(
        record.studentId === args.studentId &&
        record.classId === args.classId &&
        record.attendanceDate === args.attendanceDate
      ),
  );
  if (!args.status) {
    return filtered;
  }
  return [
    {
      studentId: args.studentId,
      classId: args.classId,
      className: args.className,
      attendanceDate: args.attendanceDate,
      status: args.status,
    },
    ...filtered,
  ];
}

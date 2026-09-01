import { describe, it, expect } from "vitest";
import {
  upsertAttendanceRecord,
  type AttendanceRecord,
} from "@/lib/attendance-records";

const RECORD_A: AttendanceRecord = {
  studentId: "student-1",
  classId: "class-1",
  className: "Algebra II",
  attendanceDate: "2026-09-07",
  status: "present",
};

describe("upsertAttendanceRecord", () => {
  it("adds a new record when none exists for that class/student/date", () => {
    const result = upsertAttendanceRecord([], {
      classId: "class-1",
      className: "Algebra II",
      studentId: "student-1",
      attendanceDate: "2026-09-07",
      status: "present",
    });
    expect(result).toEqual([RECORD_A]);
  });

  it("replaces the existing record for the same class/student/date", () => {
    const result = upsertAttendanceRecord([RECORD_A], {
      classId: "class-1",
      className: "Algebra II",
      studentId: "student-1",
      attendanceDate: "2026-09-07",
      status: "late",
    });
    expect(result).toEqual([{ ...RECORD_A, status: "late" }]);
  });

  it("removes the record when status is cleared", () => {
    const result = upsertAttendanceRecord([RECORD_A], {
      classId: "class-1",
      className: "Algebra II",
      studentId: "student-1",
      attendanceDate: "2026-09-07",
      status: "",
    });
    expect(result).toEqual([]);
  });

  it("leaves other students', classes', and dates' records untouched", () => {
    const otherStudent: AttendanceRecord = {
      ...RECORD_A,
      studentId: "student-2",
    };
    const otherClass: AttendanceRecord = { ...RECORD_A, classId: "class-2" };
    const otherDate: AttendanceRecord = {
      ...RECORD_A,
      attendanceDate: "2026-09-08",
    };
    const result = upsertAttendanceRecord(
      [RECORD_A, otherStudent, otherClass, otherDate],
      {
        classId: "class-1",
        className: "Algebra II",
        studentId: "student-1",
        attendanceDate: "2026-09-07",
        status: "absent",
      },
    );
    expect(result).toEqual([
      { ...RECORD_A, status: "absent" },
      otherStudent,
      otherClass,
      otherDate,
    ]);
  });
});

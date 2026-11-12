// Split class hours (supabase/migrations/*_class-hour-students.sql): a
// class's weekly hour can be for only some of its students. Pure - shared
// by the Schedule tab, the rosters (console calendar, Attendance tab,
// companion, attendance alerts) and the portals; tests in
// tests/class-hours.test.ts.
//
// A slot's studentIds null means everyone enrolled. A student's hours a
// week are the hours whose list includes them, and every student should
// reach the class's hours_per_week: so a 3-hour class whose third hour is
// split to A and B leaves C one hour short, to place as C's own hour.

/** Does this hour include the student? Null list: everyone does. */
export function hourIncludes(studentIds: string[] | null | undefined, studentId: string): boolean {
  return !studentIds || studentIds.includes(studentId);
}

/** A slot's weight in hours: a two-hour slot counts twice. */
export function slotHours(slot: { isTwoHour?: boolean | null }): number {
  return slot.isTwoHour ? 2 : 1;
}

export interface ClassHoursSlot {
  classId: string;
  isTwoHour?: boolean | null;
  studentIds?: string[] | null;
}

export interface HoursToPlace {
  /** Hours still to place for the whole class - the class chip's "N left". */
  everyone: number;
  /** Students short of the class's hours beyond `everyone` - their own chips. */
  students: { studentId: string; hours: number }[];
}

/**
 * What's left to place for a class. With no split hours this is exactly
 * hours_per_week minus the placed hours, as before. With split hours,
 * `everyone` is what every student still needs, and anyone needing more
 * (C, after the third hour went to A and B) gets their own count.
 */
export function hoursToPlace(
  hoursPerWeek: number,
  enrolledStudentIds: string[],
  classSlots: ClassHoursSlot[],
): HoursToPlace {
  if (enrolledStudentIds.length === 0) {
    const placed = classSlots.reduce((sum, slot) => sum + slotHours(slot), 0);
    return { everyone: Math.max(hoursPerWeek - placed, 0), students: [] };
  }
  const remaining = enrolledStudentIds.map((studentId) => {
    const placed = classSlots
      .filter((slot) => hourIncludes(slot.studentIds, studentId))
      .reduce((sum, slot) => sum + slotHours(slot), 0);
    return { studentId, hours: Math.max(hoursPerWeek - placed, 0) };
  });
  const everyone = Math.min(...remaining.map((item) => item.hours));
  return {
    everyone,
    students: remaining
      .map((item) => ({ studentId: item.studentId, hours: item.hours - everyone }))
      .filter((item) => item.hours > 0),
  };
}

/** A student's own hours a week in a class - what their portal adds up. */
export function studentHours(studentId: string, classSlots: ClassHoursSlot[]): number {
  return classSlots
    .filter((slot) => hourIncludes(slot.studentIds, studentId))
    .reduce((sum, slot) => sum + slotHours(slot), 0);
}

/**
 * Who a class's lesson on a day is for: everyone listed in any of its
 * hours that day (attendance is one mark per student, class and day). An
 * hour for everyone, or a day with no hours known, means the whole class.
 */
export function dayRoster(
  enrolledStudentIds: string[],
  hourStudentLists: (string[] | null | undefined)[],
): string[] {
  if (hourStudentLists.length === 0 || hourStudentLists.some((list) => !list)) {
    return enrolledStudentIds;
  }
  const listed = new Set(hourStudentLists.flatMap((list) => list ?? []));
  return enrolledStudentIds.filter((id) => listed.has(id));
}

/** The hours a student or their parents see: only those that include them. */
export function hoursForStudent<T extends { studentIds?: string[] | null }>(
  slots: T[],
  studentId: string,
): T[] {
  return slots.filter((slot) => hourIncludes(slot.studentIds, studentId));
}

/**
 * Checks a list of students for an hour against the class's enrolment.
 * All of them, or none, mean everyone (null). Returns an error message
 * instead when it names someone outside the class.
 */
export function normalizeHourStudents(
  studentIds: string[] | null | undefined,
  enrolledStudentIds: string[],
): { ok: true; studentIds: string[] | null } | { ok: false; error: string } {
  if (!studentIds) return { ok: true, studentIds: null };
  const unique = [...new Set(studentIds)];
  if (unique.length === 0) return { ok: false, error: "Pick at least one student for this hour" };
  if (unique.some((id) => !enrolledStudentIds.includes(id))) {
    return { ok: false, error: "Someone picked for this hour isn't in the class" };
  }
  if (enrolledStudentIds.every((id) => unique.includes(id))) return { ok: true, studentIds: null };
  return { ok: true, studentIds: unique.sort() };
}

/**
 * What a Schedule-tab drag carries: the class, and the students the hour
 * is for. Dock class chips are "class:<classId>", a student's own hour
 * "student:<classId>:<studentId>", and placed cards carry their class and
 * list in their drag data.
 */
export function dragSource(
  activeId: string,
  data: { classId?: string; studentIds?: string[] | null } | undefined,
): { classId: string | undefined; studentIds: string[] | null } {
  if (activeId.startsWith("class:")) {
    return { classId: activeId.slice("class:".length), studentIds: null };
  }
  if (activeId.startsWith("student:")) {
    const [, classId, studentId] = activeId.split(":");
    return { classId, studentIds: studentId ? [studentId] : null };
  }
  return { classId: data?.classId, studentIds: data?.studentIds ?? null };
}

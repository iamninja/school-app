/**
 * The teacher console's tabs, by value - shared by the console page (which
 * reads `?section=` deep links, e.g. from a teacher alert) and the
 * dashboard's SECTIONS list (components/teacher-dashboard.tsx), which must
 * use exactly these values.
 */
export const TEACHER_SECTION_IDS = [
  "schedule",
  "calendar",
  "classes",
  "students",
  "attendance",
  "quizzes",
  "assessments",
  "billing",
  "receipts",
  "expenses",
  "business",
  "app",
] as const;

export type TeacherSectionId = (typeof TEACHER_SECTION_IDS)[number];

export function parseTeacherSection(value: unknown): TeacherSectionId | null {
  return typeof value === "string" &&
    (TEACHER_SECTION_IDS as readonly string[]).includes(value)
    ? (value as TeacherSectionId)
    : null;
}

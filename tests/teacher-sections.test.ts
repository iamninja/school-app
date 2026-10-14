import { describe, expect, it } from "vitest";
import { parseTeacherSection, TEACHER_SECTION_IDS } from "@/lib/teacher-sections";
import { EVENTS } from "@/lib/push/messages";

describe("console ?section= links", () => {
  it("accepts only real console tabs", () => {
    expect(parseTeacherSection("quizzes")).toBe("quizzes");
    expect(parseTeacherSection("nope")).toBeNull();
    expect(parseTeacherSection(["quizzes"])).toBeNull();
    expect(parseTeacherSection(undefined)).toBeNull();
  });

  it("every teacher alert links to a tab that exists", () => {
    for (const event of ["teacher_quiz_review", "teacher_charge_failed", "teacher_mydata_failed"] as const) {
      const section = new URL(EVENTS[event].url, "https://x").searchParams.get("section");
      expect(TEACHER_SECTION_IDS).toContain(section);
    }
  });
});

import { describe, expect, it, vi } from "vitest";
import { createClient } from "@/lib/supabase/server";
import { getStudentDashboardDataAction } from "@/app/auth/student/actions";
import { createMockSupabaseClient } from "./support/mock-supabase";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

const studentRow = {
  id: "student-1",
  first_name: "Maya",
  last_name: "Carter",
  grade_level: "10",
  email: "maya@example.com",
  tuition_amount: 420,
  tuition_status: "current",
  family_id: "family-1",
};

describe("getStudentDashboardDataAction - orphaned quiz attempts", () => {
  it("surfaces a deleted quiz's snapshot even when the student has no current class assignments", async () => {
    const client = createMockSupabaseClient(
      {
        students: { data: studentRow, error: null },
        family_parents: { data: [], error: null },
        student_class_assignments: { data: [], error: null },
        class_schedule_slots: { data: [], error: null },
        attendance_records: { data: [], error: null },
        quiz_attempts: {
          data: [
            {
              id: "attempt-1",
              quiz_title: "Old Chapter 2 Quiz",
              max_score: 5,
              score: 3,
              submitted_at: "2026-01-02T00:00:00Z",
            },
          ],
          error: null,
        },
      },
      { id: "user-1" },
    );
    vi.mocked(createClient).mockResolvedValue(client as never);

    const result = await getStudentDashboardDataAction();

    expect(result.quizzes).toEqual([
      {
        id: "attempt-1",
        title: "Old Chapter 2 Quiz",
        className: "",
        completed: true,
        score: 3,
        maxScore: 5,
        submittedAt: "2026-01-02T00:00:00Z",
        quizDeleted: true,
        bestScore: 3,
        attemptsUsed: 1,
        maxAttempts: null,
        canRetake: false,
      },
    ]);
  });

  it("returns no quizzes when there are no orphaned attempts and no class assignments", async () => {
    const client = createMockSupabaseClient(
      {
        students: { data: studentRow, error: null },
        family_parents: { data: [], error: null },
        student_class_assignments: { data: [], error: null },
        class_schedule_slots: { data: [], error: null },
        attendance_records: { data: [], error: null },
        quiz_attempts: { data: [], error: null },
      },
      { id: "user-1" },
    );
    vi.mocked(createClient).mockResolvedValue(client as never);

    const result = await getStudentDashboardDataAction();

    expect(result.quizzes).toEqual([]);
  });
});

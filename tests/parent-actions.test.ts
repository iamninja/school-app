import { describe, expect, it, vi } from "vitest";
import { createClient } from "@/lib/supabase/server";
import { getParentDashboardDataAction } from "@/app/auth/parent/actions";
import { createMockSupabaseClient } from "./support/mock-supabase";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

const parentRow = {
  id: "parent-1",
  name: "Jordan Carter",
  email: "parent@example.com",
  phone: "555-1234",
  is_primary: true,
  family_id: "family-1",
};

const studentRow = {
  id: "student-1",
  first_name: "Maya",
  last_name: "Carter",
  grade_level: "10",
  email: "maya@example.com",
  tuition_amount: 420,
  tuition_status: "current",
  withdrawn_at: null,
};

describe("getParentDashboardDataAction - orphaned quiz attempts", () => {
  it("surfaces a deleted quiz's snapshot even when the student has no current class assignments", async () => {
    const client = createMockSupabaseClient(
      {
        family_parents: [
          { data: parentRow, error: null }, // own parent row
          { data: [parentRow], error: null }, // allParents
        ],
        students: { data: [studentRow], error: null },
        student_class_assignments: { data: [], error: null },
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

    const result = await getParentDashboardDataAction();

    expect(result.success).toBe(true);
    if (!result.success || !result.data) return;

    const child = result.data.kids[0];
    expect(child.quizzes).toEqual([
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
        family_parents: [
          { data: parentRow, error: null },
          { data: [parentRow], error: null },
        ],
        students: { data: [studentRow], error: null },
        student_class_assignments: { data: [], error: null },
        attendance_records: { data: [], error: null },
        quiz_attempts: { data: [], error: null },
      },
      { id: "user-1" },
    );
    vi.mocked(createClient).mockResolvedValue(client as never);

    const result = await getParentDashboardDataAction();

    expect(result.success).toBe(true);
    if (!result.success || !result.data) return;
    expect(result.data.kids[0].quizzes).toEqual([]);
  });
});

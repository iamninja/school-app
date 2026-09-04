import { describe, expect, it, vi, beforeEach } from "vitest";
import { createClient } from "@/lib/supabase/server";
import { requireTeacher } from "@/lib/auth/require-teacher";
import { ExpectedError } from "@/lib/expected-error";
import {
  createAssessmentAction,
  updateAssessmentAction,
  addStudentToAssessmentAction,
  editAssessmentAssignmentScheduleAction,
  markAssessmentTakenAction,
  enterAssessmentMarkAction,
  clearAssessmentMarkAction,
} from "@/app/protected/teacher/assessments-actions";
import { createMockSupabaseClient } from "./support/mock-supabase";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/auth/require-teacher", () => ({
  requireTeacher: vi.fn(),
}));

const CLASS_ROW = { id: "class-1", name: "Class A" };
const ASSESSMENT_ROW = {
  id: "assessment-1",
  kind: "mock_exam",
  title: "Midterm",
  max_score: 20,
  duration_minutes: 90,
  scheduled_date: "2026-09-20",
  scheduled_time: "09:00",
  deadline_at: null,
  class_id: "class-1",
  class_name: "Class A",
};
const SHORT_ASSESSMENT_INPUT = {
  kind: "short_assessment" as const,
  title: "Pop quiz",
  maxScore: 20,
  durationMinutes: 30,
};
const MOCK_EXAM_INPUT = {
  kind: "mock_exam" as const,
  title: "Midterm",
  maxScore: 20,
  durationMinutes: 90,
  scheduledDate: "2026-09-20",
  scheduledTime: "09:00",
};

describe("createAssessmentAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireTeacher).mockResolvedValue(undefined);
  });

  it("rejects when neither a class nor students are given", async () => {
    const client = createMockSupabaseClient({});
    vi.mocked(createClient).mockResolvedValue(client as never);

    await expect(
      createAssessmentAction({ ...SHORT_ASSESSMENT_INPUT }),
    ).rejects.toThrow(ExpectedError);
  });

  it("rejects when both a class and students are given", async () => {
    const client = createMockSupabaseClient({});
    vi.mocked(createClient).mockResolvedValue(client as never);

    await expect(
      createAssessmentAction({
        ...SHORT_ASSESSMENT_INPUT,
        classId: "class-1",
        studentIds: ["student-1"],
      }),
    ).rejects.toThrow(ExpectedError);
  });

  it("rejects a mock_exam with no scheduled date", async () => {
    const client = createMockSupabaseClient({});
    vi.mocked(createClient).mockResolvedValue(client as never);

    await expect(
      createAssessmentAction({
        kind: "mock_exam",
        title: "Midterm",
        maxScore: 20,
        durationMinutes: 90,
        studentIds: ["student-1"],
      }),
    ).rejects.toThrow(ExpectedError);
  });

  it("rejects a short_assessment duration over 60 minutes", async () => {
    const client = createMockSupabaseClient({});
    vi.mocked(createClient).mockResolvedValue(client as never);

    await expect(
      createAssessmentAction({
        ...SHORT_ASSESSMENT_INPUT,
        durationMinutes: 90,
        studentIds: ["student-1"],
      }),
    ).rejects.toThrow(ExpectedError);
  });

  it("rejects a mock_exam duration under 60 minutes", async () => {
    const client = createMockSupabaseClient({});
    vi.mocked(createClient).mockResolvedValue(client as never);

    await expect(
      createAssessmentAction({
        ...MOCK_EXAM_INPUT,
        durationMinutes: 45,
        studentIds: ["student-1"],
      }),
    ).rejects.toThrow(ExpectedError);
  });

  it("rejects a classId that doesn't belong to this teacher", async () => {
    const client = createMockSupabaseClient({
      classes: { data: null, error: null },
    });
    vi.mocked(createClient).mockResolvedValue(client as never);

    await expect(
      createAssessmentAction({ ...SHORT_ASSESSMENT_INPUT, classId: "not-mine" }),
    ).rejects.toThrow(ExpectedError);
  });

  it("rejects a class with no enrolled students", async () => {
    const client = createMockSupabaseClient({
      classes: { data: CLASS_ROW, error: null },
      student_class_assignments: { data: [], error: null },
    });
    vi.mocked(createClient).mockResolvedValue(client as never);

    await expect(
      createAssessmentAction({ ...SHORT_ASSESSMENT_INPUT, classId: "class-1" }),
    ).rejects.toThrow(ExpectedError);
  });

  it("snapshots the class roster into one assignment per enrolled student, defaulting each from the assessment's template", async () => {
    const client = createMockSupabaseClient({
      classes: { data: CLASS_ROW, error: null },
      student_class_assignments: {
        data: [{ student_id: "student-1" }, { student_id: "student-2" }],
        error: null,
      },
      assessments: { data: ASSESSMENT_ROW, error: null },
      assessment_assignments: {
        data: [
          { id: "a1", student_id: "student-1", students: { first_name: "Ada", last_name: "L" } },
          { id: "a2", student_id: "student-2", students: { first_name: "Bea", last_name: "M" } },
        ],
        error: null,
      },
    });
    vi.mocked(createClient).mockResolvedValue(client as never);

    const result = await createAssessmentAction({
      ...MOCK_EXAM_INPUT,
      classId: "class-1",
    });

    expect(result.assignments).toHaveLength(2);

    const assignmentInsert = client.from.mock.results.find(
      (r, i) => client.from.mock.calls[i][0] === "assessment_assignments",
    )?.value.insert.mock.calls[0][0];
    expect(assignmentInsert).toHaveLength(2);
    expect(assignmentInsert[0]).toMatchObject({
      student_id: "student-1",
      effective_scheduled_date: "2026-09-20",
      effective_scheduled_time: "09:00",
    });
  });

  it("rejects an individual-student assignment when one student doesn't belong to this teacher", async () => {
    const client = createMockSupabaseClient({
      students: { data: [{ id: "student-1" }], error: null },
    });
    vi.mocked(createClient).mockResolvedValue(client as never);

    await expect(
      createAssessmentAction({
        ...SHORT_ASSESSMENT_INPUT,
        studentIds: ["student-1", "student-2"],
      }),
    ).rejects.toThrow(ExpectedError);
  });
});

describe("updateAssessmentAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireTeacher).mockResolvedValue(undefined);
  });

  it("rejects changing an assessment's kind", async () => {
    const client = createMockSupabaseClient({
      assessments: { data: { id: "assessment-1", kind: "short_assessment" }, error: null },
    });
    vi.mocked(createClient).mockResolvedValue(client as never);

    await expect(
      updateAssessmentAction("assessment-1", { ...MOCK_EXAM_INPUT }),
    ).rejects.toThrow(ExpectedError);
  });

  it("rejects an assessment that doesn't belong to this teacher", async () => {
    const client = createMockSupabaseClient({
      assessments: { data: null, error: null },
    });
    vi.mocked(createClient).mockResolvedValue(client as never);

    await expect(
      updateAssessmentAction("not-mine", { ...SHORT_ASSESSMENT_INPUT }),
    ).rejects.toThrow(ExpectedError);
  });
});

describe("addStudentToAssessmentAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireTeacher).mockResolvedValue(undefined);
  });

  it("defaults the new assignment's schedule from the assessment's current template", async () => {
    const client = createMockSupabaseClient({
      assessments: { data: ASSESSMENT_ROW, error: null },
      students: { data: { id: "student-3" }, error: null },
      assessment_assignments: {
        data: {
          id: "a3",
          student_id: "student-3",
          students: { first_name: "Cara", last_name: "N" },
        },
        error: null,
      },
    });
    vi.mocked(createClient).mockResolvedValue(client as never);

    await addStudentToAssessmentAction("assessment-1", "student-3");

    const insertedRow = client.from.mock.results.find(
      (r, i) => client.from.mock.calls[i][0] === "assessment_assignments",
    )?.value.insert.mock.calls[0][0];
    expect(insertedRow).toMatchObject({
      effective_scheduled_date: ASSESSMENT_ROW.scheduled_date,
      effective_scheduled_time: ASSESSMENT_ROW.scheduled_time,
    });
  });

  it("turns a unique-constraint violation into a readable ExpectedError", async () => {
    const client = createMockSupabaseClient({
      assessments: { data: ASSESSMENT_ROW, error: null },
      students: { data: { id: "student-1" }, error: null },
      assessment_assignments: {
        data: null,
        error: { code: "23505", message: "duplicate key" },
      },
    });
    vi.mocked(createClient).mockResolvedValue(client as never);

    await expect(
      addStudentToAssessmentAction("assessment-1", "student-1"),
    ).rejects.toThrow(ExpectedError);
  });
});

describe("editAssessmentAssignmentScheduleAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireTeacher).mockResolvedValue(undefined);
  });

  it("rejects a scheduled date missing for a mock_exam assignment", async () => {
    const client = createMockSupabaseClient({
      assessment_assignments: { data: { id: "a1", kind: "mock_exam" }, error: null },
    });
    vi.mocked(createClient).mockResolvedValue(client as never);

    await expect(
      editAssessmentAssignmentScheduleAction("a1", {
        deadlineAt: "2026-09-20T00:00:00Z",
      }),
    ).rejects.toThrow(ExpectedError);
  });
});

describe("markAssessmentTakenAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireTeacher).mockResolvedValue(undefined);
  });

  it("rejects marking an assignment taken twice", async () => {
    const client = createMockSupabaseClient({
      assessment_assignments: { data: { id: "a1", status: "taken" }, error: null },
    });
    vi.mocked(createClient).mockResolvedValue(client as never);

    await expect(markAssessmentTakenAction("a1")).rejects.toThrow(
      ExpectedError,
    );
  });
});

describe("enterAssessmentMarkAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireTeacher).mockResolvedValue(undefined);
  });

  it("rejects a score above the assessment's max_score", async () => {
    const client = createMockSupabaseClient({
      assessment_assignments: {
        data: {
          id: "a1",
          taken_at: null,
          assessment_id: "assessment-1",
          assessments: { max_score: 20 },
        },
        error: null,
      },
    });
    vi.mocked(createClient).mockResolvedValue(client as never);

    await expect(
      enterAssessmentMarkAction("a1", { score: 25 }),
    ).rejects.toThrow(ExpectedError);
  });

  it("sets taken_at when grading an assignment that was never marked taken", async () => {
    const client = createMockSupabaseClient({
      assessment_assignments: [
        {
          data: {
            id: "a1",
            taken_at: null,
            assessment_id: "assessment-1",
            assessments: { max_score: 20 },
          },
          error: null,
        },
        {
          data: { id: "a1", status: "marked", score: 18, taken_at: "2026-09-10T00:00:00.000Z" },
          error: null,
        },
      ],
    });
    vi.mocked(createClient).mockResolvedValue(client as never);

    await enterAssessmentMarkAction("a1", {
      score: 18,
      takenAt: "2026-09-10T00:00:00.000Z",
    });

    const updateCall = client.from.mock.results.at(-1)?.value.update.mock.calls[0][0];
    expect(updateCall.taken_at).toBe("2026-09-10T00:00:00.000Z");
  });

  it("never overwrites an existing taken_at when re-grading", async () => {
    const originalTakenAt = "2026-09-01T00:00:00.000Z";
    const client = createMockSupabaseClient({
      assessment_assignments: [
        {
          data: {
            id: "a1",
            taken_at: originalTakenAt,
            assessment_id: "assessment-1",
            assessments: { max_score: 20 },
          },
          error: null,
        },
        {
          data: { id: "a1", status: "marked", score: 19, taken_at: originalTakenAt },
          error: null,
        },
      ],
    });
    vi.mocked(createClient).mockResolvedValue(client as never);

    // Even though a different takenAt is supplied, the already-set value wins.
    await enterAssessmentMarkAction("a1", {
      score: 19,
      takenAt: "2026-09-15T00:00:00.000Z",
    });

    const updateCall = client.from.mock.results.at(-1)?.value.update.mock.calls[0][0];
    expect(updateCall.taken_at).toBe(originalTakenAt);
  });
});

describe("clearAssessmentMarkAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireTeacher).mockResolvedValue(undefined);
  });

  it("rejects clearing a mark that hasn't been entered", async () => {
    const client = createMockSupabaseClient({
      assessment_assignments: { data: { id: "a1", status: "taken" }, error: null },
    });
    vi.mocked(createClient).mockResolvedValue(client as never);

    await expect(clearAssessmentMarkAction("a1")).rejects.toThrow(
      ExpectedError,
    );
  });

  it("reverts status to 'taken' without touching taken_at", async () => {
    const client = createMockSupabaseClient({
      assessment_assignments: [
        { data: { id: "a1", status: "marked" }, error: null },
        {
          data: { id: "a1", status: "taken", score: null, teacher_comment: null },
          error: null,
        },
      ],
    });
    vi.mocked(createClient).mockResolvedValue(client as never);

    await clearAssessmentMarkAction("a1");

    const updateCall = client.from.mock.results.at(-1)?.value.update.mock.calls[0][0];
    expect(updateCall).not.toHaveProperty("taken_at");
    expect(updateCall.status).toBe("taken");
    expect(updateCall.score).toBeNull();
  });
});

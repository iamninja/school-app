import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@/lib/supabase/server";
import { requireTeacher } from "@/lib/auth/require-teacher";
import { ExpectedError } from "@/lib/expected-error";
import {
  archiveClassAction,
  createClassAction,
  createStudentAction,
  enrollStudentInClassAction,
  restoreClassAction,
  restoreStudentAction,
  setAttendanceAction,
  unenrollStudentFromClassAction,
  updateClassAction,
  withdrawStudentAction,
} from "@/app/protected/teacher/actions";
import { createMockSupabaseClient } from "./support/mock-supabase";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/auth/require-teacher", () => ({
  requireTeacher: vi.fn(),
}));

const baseNewFamilyInput = {
  familyMode: "new" as const,
  firstName: "Maya",
  lastName: "Carter",
  gradeLevel: "10",
  email: "maya@example.com",
  parentName: "Jordan Carter",
  parentEmail: "parent@example.com",
  parentPhone: "(555) 123-4567",
  tuitionAmount: "420",
  tuitionStatus: "current" as const,
  assignedClassIds: [] as string[],
};

describe("teacher actions - createStudentAction", () => {
  beforeEach(() => {
    vi.mocked(requireTeacher).mockResolvedValue(undefined);
  });

  it("creates a new family and returns the composed student", async () => {
    vi.mocked(createClient).mockResolvedValue(
      createMockSupabaseClient({
        families: { data: { id: "family-1" }, error: null },
        students: { data: { id: "student-1" }, error: null },
        family_parents: { data: null, error: null },
      }) as never,
    );

    const result = await createStudentAction(baseNewFamilyInput);

    expect(result.id).toBe("student-1");
    expect(result.familyId).toBe("family-1");
    expect(result.parentName).toBe("Jordan Carter");
  });

  it("looks up an existing family and skips parent fields", async () => {
    vi.mocked(createClient).mockResolvedValue(
      createMockSupabaseClient({
        families: { data: { id: "family-2" }, error: null },
        students: { data: { id: "student-2" }, error: null },
      }) as never,
    );

    const result = await createStudentAction({
      ...baseNewFamilyInput,
      familyMode: "existing",
      familyId: "family-2",
    });

    expect(result.familyId).toBe("family-2");
    expect(result.parentName).toBe("");
  });

  it("throws when the existing family isn't found", async () => {
    vi.mocked(createClient).mockResolvedValue(
      createMockSupabaseClient({
        families: { data: null, error: null },
      }) as never,
    );

    await expect(
      createStudentAction({
        ...baseNewFamilyInput,
        familyMode: "existing",
        familyId: "family-missing",
      }),
    ).rejects.toThrow("Family not found");
  });

  it("surfaces a duplicate parent email as a friendly ExpectedError", async () => {
    vi.mocked(createClient).mockResolvedValue(
      createMockSupabaseClient({
        families: { data: { id: "family-1" }, error: null },
        students: { data: { id: "student-1" }, error: null },
        family_parents: {
          data: null,
          error: { code: "23505", message: "duplicate key value" },
        },
      }) as never,
    );

    await expect(createStudentAction(baseNewFamilyInput)).rejects.toThrow(
      ExpectedError,
    );
    await expect(createStudentAction(baseNewFamilyInput)).rejects.toThrow(
      /Use "Existing family" instead/,
    );
  });
});

describe("teacher actions - setAttendanceAction", () => {
  beforeEach(() => {
    vi.mocked(requireTeacher).mockResolvedValue(undefined);
  });

  it("deletes the record when status is cleared", async () => {
    const client = createMockSupabaseClient({
      attendance_records: { data: null, error: null },
    });
    vi.mocked(createClient).mockResolvedValue(client as never);

    const result = await setAttendanceAction({
      classId: "class-1",
      studentId: "student-1",
      attendanceDate: "2026-08-16",
      status: "",
    });

    expect(result).toEqual({ studentId: "student-1", status: "" });
    const chain = client.from.mock.results[0].value;
    expect(chain.delete).toHaveBeenCalled();
    expect(chain.upsert).not.toHaveBeenCalled();
  });

  it("upserts the record when a status is set", async () => {
    const client = createMockSupabaseClient({
      attendance_records: { data: null, error: null },
    });
    vi.mocked(createClient).mockResolvedValue(client as never);

    const result = await setAttendanceAction({
      classId: "class-1",
      studentId: "student-1",
      attendanceDate: "2026-08-16",
      status: "present",
    });

    expect(result).toEqual({ studentId: "student-1", status: "present" });
    const chain = client.from.mock.results[0].value;
    expect(chain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ status: "present" }),
      expect.objectContaining({
        onConflict: "teacher_id,class_id,student_id,attendance_date",
      }),
    );
    expect(chain.delete).not.toHaveBeenCalled();
  });
});

describe("teacher actions - withdraw/restore round trip", () => {
  beforeEach(() => {
    vi.mocked(requireTeacher).mockResolvedValue(undefined);
  });

  it("sets withdrawn_at then clears it", async () => {
    vi.mocked(createClient).mockResolvedValue(
      createMockSupabaseClient({
        students: [
          { data: null, error: null },
          { data: null, error: null },
        ],
      }) as never,
    );

    const withdrawn = await withdrawStudentAction("student-1");
    expect(withdrawn.withdrawnAt).not.toBeNull();

    const restored = await restoreStudentAction("student-1");
    expect(restored.withdrawnAt).toBeNull();
  });
});

describe("teacher actions - updateClassAction", () => {
  beforeEach(() => {
    vi.mocked(requireTeacher).mockResolvedValue(undefined);
  });

  it("updates the class and returns the new values", async () => {
    vi.mocked(createClient).mockResolvedValue(
      createMockSupabaseClient({
        classes: {
          data: { id: "class-1", name: "Algebra I", hours_per_week: 4 },
          error: null,
        },
      }) as never,
    );

    const result = await updateClassAction({
      classId: "class-1",
      name: "Algebra I",
      hoursPerWeek: 4,
    });

    expect(result).toEqual({
      id: "class-1",
      name: "Algebra I",
      hoursPerWeek: 4,
    });
  });
});

describe("teacher actions - archive/restore class round trip", () => {
  beforeEach(() => {
    vi.mocked(requireTeacher).mockResolvedValue(undefined);
  });

  it("sets archived_at then clears it", async () => {
    vi.mocked(createClient).mockResolvedValue(
      createMockSupabaseClient({
        classes: [
          { data: null, error: null },
          { data: null, error: null },
        ],
      }) as never,
    );

    const archived = await archiveClassAction("class-1");
    expect(archived.archivedAt).not.toBeNull();

    const restored = await restoreClassAction("class-1");
    expect(restored.archivedAt).toBeNull();
  });
});

describe("teacher actions - enrollment", () => {
  beforeEach(() => {
    vi.mocked(requireTeacher).mockResolvedValue(undefined);
  });

  it("enrolls a student in a class", async () => {
    vi.mocked(createClient).mockResolvedValue(
      createMockSupabaseClient({
        students: { data: { id: "student-1" }, error: null },
        classes: { data: { id: "class-1" }, error: null },
        student_class_assignments: { data: null, error: null },
      }) as never,
    );

    await expect(
      enrollStudentInClassAction("student-1", "class-1"),
    ).resolves.toBeUndefined();
  });

  it("unenrolls a student from a class", async () => {
    vi.mocked(createClient).mockResolvedValue(
      createMockSupabaseClient({
        students: { data: { id: "student-1" }, error: null },
        classes: { data: { id: "class-1" }, error: null },
        student_class_assignments: { data: null, error: null },
      }) as never,
    );

    await expect(
      unenrollStudentFromClassAction("student-1", "class-1"),
    ).resolves.toBeUndefined();
  });

  it("throws when the class doesn't belong to this teacher", async () => {
    vi.mocked(createClient).mockResolvedValue(
      createMockSupabaseClient({
        students: { data: { id: "student-1" }, error: null },
        classes: { data: null, error: null },
      }) as never,
    );

    await expect(
      enrollStudentInClassAction("student-1", "class-1"),
    ).rejects.toThrow("Class not found");
  });

  it("throws when the student doesn't belong to this teacher", async () => {
    vi.mocked(createClient).mockResolvedValue(
      createMockSupabaseClient({
        students: { data: null, error: null },
      }) as never,
    );

    await expect(
      enrollStudentInClassAction("student-1", "class-1"),
    ).rejects.toThrow("Student not found");
  });
});

describe("teacher actions - auth gate", () => {
  it("throws when there's no authenticated user", async () => {
    vi.mocked(createClient).mockResolvedValue(
      createMockSupabaseClient({}, null) as never,
    );

    await expect(
      createClassAction({ name: "Algebra", hoursPerWeek: 2 }),
    ).rejects.toThrow("Not authenticated");
  });

  it("propagates a requireTeacher rejection", async () => {
    vi.mocked(createClient).mockResolvedValue(
      createMockSupabaseClient({}) as never,
    );
    vi.mocked(requireTeacher).mockRejectedValue(
      new Error("Not authorized as a teacher"),
    );

    await expect(
      createClassAction({ name: "Algebra", hoursPerWeek: 2 }),
    ).rejects.toThrow("Not authorized as a teacher");
  });
});

import { describe, expect, it, vi, beforeEach } from "vitest";
import { createClient } from "@/lib/supabase/server";
import { requireTeacher } from "@/lib/auth/require-teacher";
import { ExpectedError } from "@/lib/expected-error";
import {
  createHomeworkAction,
  updateHomeworkAction,
  deleteHomeworkAction,
} from "@/app/protected/teacher/homework-actions";
import { createMockSupabaseClient } from "./support/mock-supabase";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/auth/require-teacher", () => ({
  requireTeacher: vi.fn(),
}));

const CLASS_ROW = { id: "class-1", name: "Class A" };
const HOMEWORK_ROW = {
  id: "homework-1",
  class_id: "class-1",
  note: "p. 42, exercises 1-10",
  due_date: "2026-09-20",
  created_at: "2026-09-10T10:00:00Z",
};

describe("createHomeworkAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireTeacher).mockResolvedValue(undefined);
  });

  it("rejects an empty note", async () => {
    const client = createMockSupabaseClient({});
    vi.mocked(createClient).mockResolvedValue(client as never);

    await expect(
      createHomeworkAction({ classId: "class-1", note: "   " }),
    ).rejects.toThrow(ExpectedError);
  });

  it("rejects a malformed due date", async () => {
    const client = createMockSupabaseClient({});
    vi.mocked(createClient).mockResolvedValue(client as never);

    await expect(
      createHomeworkAction({
        classId: "class-1",
        note: "Exercises 1-10",
        dueDate: "not-a-date",
      }),
    ).rejects.toThrow(ExpectedError);
  });

  it("rejects a classId that doesn't belong to this teacher", async () => {
    const client = createMockSupabaseClient({
      classes: { data: null, error: null },
    });
    vi.mocked(createClient).mockResolvedValue(client as never);

    await expect(
      createHomeworkAction({ classId: "not-mine", note: "Exercises 1-10" }),
    ).rejects.toThrow(ExpectedError);
  });

  it("inserts a trimmed note and resolves the class name", async () => {
    const client = createMockSupabaseClient({
      classes: { data: CLASS_ROW, error: null },
      homework: { data: HOMEWORK_ROW, error: null },
    });
    vi.mocked(createClient).mockResolvedValue(client as never);

    const result = await createHomeworkAction({
      classId: "class-1",
      note: "  p. 42, exercises 1-10  ",
      dueDate: "2026-09-20",
    });

    expect(result).toMatchObject({
      id: "homework-1",
      className: "Class A",
      note: "p. 42, exercises 1-10",
      due_date: "2026-09-20",
    });

    const insertCall = client.from.mock.results.find(
      (r, i) => client.from.mock.calls[i][0] === "homework",
    )?.value.insert.mock.calls[0][0];
    expect(insertCall).toMatchObject({
      teacher_id: "teacher-1",
      class_id: "class-1",
      note: "p. 42, exercises 1-10",
      due_date: "2026-09-20",
    });
  });

  it("allows a null due date", async () => {
    const client = createMockSupabaseClient({
      classes: { data: CLASS_ROW, error: null },
      homework: { data: { ...HOMEWORK_ROW, due_date: null }, error: null },
    });
    vi.mocked(createClient).mockResolvedValue(client as never);

    const result = await createHomeworkAction({
      classId: "class-1",
      note: "Exercises 1-10",
    });

    expect(result.due_date).toBeNull();
  });
});

describe("updateHomeworkAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireTeacher).mockResolvedValue(undefined);
  });

  it("rejects when the homework item isn't owned by this teacher", async () => {
    const client = createMockSupabaseClient({
      homework: { data: null, error: null },
    });
    vi.mocked(createClient).mockResolvedValue(client as never);

    await expect(
      updateHomeworkAction("not-mine", { note: "New note" }),
    ).rejects.toThrow(ExpectedError);
  });

  it("updates the note and due date, leaving class_id untouched", async () => {
    const existing = {
      ...HOMEWORK_ROW,
      classes: { name: "Class A" },
    };
    const updated = { ...HOMEWORK_ROW, note: "New note", due_date: "2026-09-25" };
    const client = createMockSupabaseClient({
      homework: [
        { data: existing, error: null },
        { data: updated, error: null },
      ],
    });
    vi.mocked(createClient).mockResolvedValue(client as never);

    const result = await updateHomeworkAction("homework-1", {
      note: "New note",
      dueDate: "2026-09-25",
    });

    expect(result).toMatchObject({
      note: "New note",
      due_date: "2026-09-25",
      className: "Class A",
    });

    const updateCall = client.from.mock.results.at(-1)?.value.update.mock
      .calls[0][0];
    expect(updateCall).toEqual({ note: "New note", due_date: "2026-09-25" });
  });
});

describe("deleteHomeworkAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireTeacher).mockResolvedValue(undefined);
  });

  it("deletes scoped by id and teacher_id", async () => {
    const client = createMockSupabaseClient({
      homework: { data: null, error: null },
    });
    vi.mocked(createClient).mockResolvedValue(client as never);

    await deleteHomeworkAction("homework-1");

    const homeworkChain = client.from.mock.results.find(
      (r, i) => client.from.mock.calls[i][0] === "homework",
    )?.value;
    expect(homeworkChain.delete).toHaveBeenCalled();
    expect(homeworkChain.eq).toHaveBeenCalledWith("id", "homework-1");
    expect(homeworkChain.eq).toHaveBeenCalledWith("teacher_id", "teacher-1");
  });
});

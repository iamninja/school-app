import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@/lib/supabase/server";
import { requireTeacher } from "@/lib/auth/require-teacher";
import { ExpectedError } from "@/lib/expected-error";
import {
  createTaskAction,
  deleteTaskAction,
  listTasksAction,
  setTaskDoneAction,
  updateTaskAction,
} from "@/app/protected/teacher/task-actions";
import { createMockSupabaseClient } from "./support/mock-supabase";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/auth/require-teacher", () => ({ requireTeacher: vi.fn() }));

function insertedRow(client: ReturnType<typeof createMockSupabaseClient>) {
  const index = client.from.mock.calls.findIndex((call) => call[0] === "teacher_tasks");
  return client.from.mock.results[index].value.insert.mock.calls[0][0];
}

describe("teacher task actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireTeacher).mockResolvedValue(undefined);
  });

  it("adds a personal task for the teacher, trimmed, with an optional time", async () => {
    const client = createMockSupabaseClient({ teacher_tasks: { data: { id: "t1" }, error: null } });
    vi.mocked(createClient).mockResolvedValue(client as never);

    await createTaskAction({ kind: "personal", title: "  Λογιστής ", date: "2026-10-26", time: "12:00" });

    expect(insertedRow(client)).toEqual({
      teacher_id: "teacher-1",
      kind: "personal",
      title: "Λογιστής",
      is_call: false,
      task_date: "2026-10-26",
      task_time: "12:00",
    });
  });

  it("files a lesson task under the teacher's own class, labelled from the class row", async () => {
    const client = createMockSupabaseClient({
      classes: { data: { id: "class-a", name: "Β Λυκείου" }, error: null },
      teacher_tasks: { data: { id: "t2" }, error: null },
    });
    vi.mocked(createClient).mockResolvedValue(client as never);

    await createTaskAction({
      kind: "lesson",
      title: "Τύπωσε φυλλάδια",
      date: "2026-10-26",
      phase: "before",
      lesson: { classId: "class-a", slotTime: "17:00" },
    });

    const classChain = client.from.mock.results[0].value;
    expect(classChain.eq).toHaveBeenCalledWith("teacher_id", "teacher-1");
    expect(insertedRow(client)).toEqual(
      expect.objectContaining({
        kind: "lesson",
        phase: "before",
        class_id: "class-a",
        slot_time: "17:00",
        lesson_label: "Β Λυκείου 17:00",
      }),
    );
  });

  it("refuses an event lesson on another date", async () => {
    const client = createMockSupabaseClient({
      calendar_events: {
        data: { id: "e1", event_type: "ad_hoc_lesson", event_date: "2026-10-27", start_time: "16:00", class_name: null, student_name: "Ada", contact_name: null },
        error: null,
      },
    });
    vi.mocked(createClient).mockResolvedValue(client as never);

    await expect(
      createTaskAction({ kind: "lesson", title: "x", date: "2026-10-26", phase: "after", lesson: { eventId: "e1" } }),
    ).rejects.toThrow(ExpectedError);
  });

  it.each([
    [{ kind: "personal", title: "   ", date: "2026-10-26" }],
    [{ kind: "personal", title: "x", date: "2026-02-30" }],
    [{ kind: "personal", title: "x".repeat(201), date: "2026-10-26" }],
    [{ kind: "personal", title: "x", date: "2026-10-26", time: "25:00" }],
  ])("rejects bad input before writing: %o", async (input) => {
    const client = createMockSupabaseClient({});
    vi.mocked(createClient).mockResolvedValue(client as never);
    await expect(createTaskAction(input as never)).rejects.toThrow(ExpectedError);
    expect(client.from).not.toHaveBeenCalled();
  });

  it("ticks and unticks a task, scoped to the teacher", async () => {
    const client = createMockSupabaseClient({ teacher_tasks: { data: { id: "t1" }, error: null } });
    vi.mocked(createClient).mockResolvedValue(client as never);

    await setTaskDoneAction("t1", false);

    const chain = client.from.mock.results[0].value;
    expect(chain.update).toHaveBeenCalledWith({ done_at: null });
    expect(chain.eq).toHaveBeenCalledWith("teacher_id", "teacher-1");
  });

  it("won't move a lesson task to another day", async () => {
    const client = createMockSupabaseClient({ teacher_tasks: { data: { kind: "lesson" }, error: null } });
    vi.mocked(createClient).mockResolvedValue(client as never);
    await expect(updateTaskAction("t1", { date: "2026-10-27" })).rejects.toThrow(ExpectedError);
  });

  it("lists the range plus earlier open tasks, without duplicates", async () => {
    const client = createMockSupabaseClient({
      teacher_tasks: [
        { data: [{ id: "a" }, { id: "b" }], error: null },
        { data: [{ id: "b" }, { id: "c" }], error: null },
      ],
    });
    vi.mocked(createClient).mockResolvedValue(client as never);

    const tasks = await listTasksAction({ from: "2026-10-01", to: "2026-10-31", today: "2026-10-26" });
    expect(tasks.map((t) => t.id).sort()).toEqual(["a", "b", "c"]);
  });

  it("deletes only the teacher's own task", async () => {
    const client = createMockSupabaseClient({ teacher_tasks: { data: null, error: null } });
    vi.mocked(createClient).mockResolvedValue(client as never);
    await deleteTaskAction("t1");
    const chain = client.from.mock.results[0].value;
    expect(chain.delete).toHaveBeenCalled();
    expect(chain.eq).toHaveBeenCalledWith("teacher_id", "teacher-1");
  });

  describe("tags and call tasks", () => {
    const PARENT = "11111111-1111-1111-1111-111111111111";
    const STUDENT = "33333333-3333-3333-3333-333333333333";

    it("stores a call task whose tagged parent is the teacher's own", async () => {
      const client = createMockSupabaseClient({
        family_parents: { data: [{ id: PARENT }], error: null },
        teacher_tasks: { data: { id: "t9" }, error: null },
      });
      vi.mocked(createClient).mockResolvedValue(client as never);

      await createTaskAction({
        kind: "personal",
        title: `Πάρε @[Ελένη](parent:${PARENT}) για το διαγώνισμα`,
        date: "2026-10-30",
        isCall: true,
      });

      const parentsChain = client.from.mock.results[0].value;
      expect(parentsChain.eq).toHaveBeenCalledWith("families.teacher_id", "teacher-1");
      expect(insertedRow(client)).toEqual(
        expect.objectContaining({
          title: `Πάρε @[Ελένη](parent:${PARENT}) για το διαγώνισμα`,
          is_call: true,
        }),
      );
    });

    it("refuses a tag for someone who isn't the teacher's", async () => {
      const client = createMockSupabaseClient({
        students: { data: [], error: null },
      });
      vi.mocked(createClient).mockResolvedValue(client as never);

      await expect(
        createTaskAction({
          kind: "personal",
          title: `Call @[Μαρία](student:${STUDENT})`,
          date: "2026-10-30",
        }),
      ).rejects.toThrow(ExpectedError);
      expect(client.from.mock.calls.map((call) => call[0])).not.toContain("teacher_tasks");
    });

    it("holds the visible text, not the stored tokens, to 200 characters", async () => {
      const client = createMockSupabaseClient({
        family_parents: { data: [{ id: PARENT }], error: null },
        teacher_tasks: { data: { id: "t10" }, error: null },
      });
      vi.mocked(createClient).mockResolvedValue(client as never);

      // 190 visible characters, well over 200 stored.
      const title = `${"x".repeat(183)} @[Ελένη](parent:${PARENT})`;
      await expect(
        createTaskAction({ kind: "personal", title, date: "2026-10-30" }),
      ).resolves.toBeDefined();
    });
  });
});

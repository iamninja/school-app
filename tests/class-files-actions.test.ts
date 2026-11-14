import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@/lib/supabase/server";
import { requireTeacher } from "@/lib/auth/require-teacher";
import { ExpectedError } from "@/lib/expected-error";
import { notifyAfterResponse } from "@/lib/push/hooks";
import {
  createClassFileAction,
  deleteClassFileAction,
  discardClassFileUploadAction,
  updateClassFileAction,
} from "@/app/protected/teacher/class-files-actions";
import { createMockSupabaseClient } from "./support/mock-supabase";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/auth/require-teacher", () => ({ requireTeacher: vi.fn() }));
vi.mock("@/lib/push/hooks", () => ({ notifyAfterResponse: vi.fn() }));

const CLASS_ID = "c0000000-0000-0000-0000-000000000001";
const PATH = `teacher-1/${CLASS_ID}/a0000000-0000-0000-0000-00000000000a.pdf`;
const CLASS_ROW = { id: CLASS_ID, name: "Β Λυκείου" };
const FILE_ROW = {
  id: "file-1",
  class_id: CLASS_ID,
  homework_id: null,
  kind: "file",
  title: "Φυλλάδιο",
  note: null,
  file_name: "Φυλλάδιο.pdf",
  size_bytes: 1000,
  url: null,
  pinned: false,
  created_at: "2026-11-14T10:00:00Z",
};

function withStorage(client: ReturnType<typeof createMockSupabaseClient>) {
  const remove = vi.fn(async () => ({ data: [], error: null }));
  client.storage = { from: vi.fn(() => ({ remove })) };
  return remove;
}

function insertedRow(client: ReturnType<typeof createMockSupabaseClient>) {
  const index = client.from.mock.calls.findIndex(([table]) => table === "class_files");
  return client.from.mock.results[index].value.insert.mock.calls[0][0];
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireTeacher).mockResolvedValue(undefined);
});

describe("createClassFileAction", () => {
  it("rejects a class that isn't the teacher's", async () => {
    const client = createMockSupabaseClient({ classes: { data: null, error: null } });
    vi.mocked(createClient).mockResolvedValue(client as never);
    await expect(
      createClassFileAction({ classId: "nope", storagePath: PATH, fileName: "a.pdf", sizeBytes: 10 }),
    ).rejects.toThrow(ExpectedError);
  });

  it("rejects an upload path outside the teacher's folder for this class", async () => {
    const client = createMockSupabaseClient({ classes: { data: CLASS_ROW, error: null } });
    vi.mocked(createClient).mockResolvedValue(client as never);
    await expect(
      createClassFileAction({
        classId: CLASS_ID,
        storagePath: `someone-else/${CLASS_ID}/a0000000-0000-0000-0000-00000000000a.pdf`,
        fileName: "a.pdf",
        sizeBytes: 10,
      }),
    ).rejects.toThrow("doesn't belong");
  });

  it("rejects a file over 20 MB", async () => {
    const client = createMockSupabaseClient({ classes: { data: CLASS_ROW, error: null } });
    vi.mocked(createClient).mockResolvedValue(client as never);
    await expect(
      createClassFileAction({ classId: CLASS_ID, storagePath: PATH, fileName: "a.pdf", sizeBytes: 21 * 1024 * 1024 }),
    ).rejects.toThrow("20 MB");
  });

  it("saves an uploaded PDF titled after its name and notifies the class", async () => {
    const client = createMockSupabaseClient({
      classes: { data: CLASS_ROW, error: null },
      class_files: { data: FILE_ROW, error: null },
    });
    vi.mocked(createClient).mockResolvedValue(client as never);

    const result = await createClassFileAction({
      classId: CLASS_ID,
      storagePath: PATH,
      fileName: "Φυλλάδιο.pdf",
      sizeBytes: 1000,
      title: "  ",
    });

    expect(result.id).toBe("file-1");
    expect(insertedRow(client)).toMatchObject({
      kind: "file",
      teacher_id: "teacher-1",
      class_id: CLASS_ID,
      storage_path: PATH,
      file_name: "Φυλλάδιο.pdf",
      size_bytes: 1000,
      title: "Φυλλάδιο",
      homework_id: null,
      note: null,
    });
    expect(notifyAfterResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "class_file",
        to: { kind: "class_students", classId: CLASS_ID },
        values: { class: "Β Λυκείου", title: "Φυλλάδιο" },
      }),
    );
  });

  it("saves a link (https added) without notifying when asked not to", async () => {
    const client = createMockSupabaseClient({
      classes: { data: CLASS_ROW, error: null },
      class_files: { data: { ...FILE_ROW, kind: "link" }, error: null },
    });
    vi.mocked(createClient).mockResolvedValue(client as never);

    await createClassFileAction({
      classId: CLASS_ID,
      url: "drive.google.com/file/d/x",
      title: "Θεωρία",
      notify: false,
    });

    expect(insertedRow(client)).toMatchObject({
      kind: "link",
      url: "https://drive.google.com/file/d/x",
      title: "Θεωρία",
    });
    expect(notifyAfterResponse).not.toHaveBeenCalled();
  });

  it("needs a title for a link, and a real link", async () => {
    const client = createMockSupabaseClient({ classes: { data: CLASS_ROW, error: null } });
    vi.mocked(createClient).mockResolvedValue(client as never);
    await expect(createClassFileAction({ classId: CLASS_ID, url: "https://a.gr" })).rejects.toThrow("title");
    await expect(createClassFileAction({ classId: CLASS_ID, url: "nope", title: "x" })).rejects.toThrow(
      ExpectedError,
    );
  });

  it("only attaches to a homework item of the same class", async () => {
    const client = createMockSupabaseClient({
      classes: { data: CLASS_ROW, error: null },
      homework: { data: null, error: null },
    });
    vi.mocked(createClient).mockResolvedValue(client as never);
    await expect(
      createClassFileAction({ classId: CLASS_ID, url: "https://a.gr", title: "x", homeworkId: "other-hw" }),
    ).rejects.toThrow("homework");
  });
});

describe("updateClassFileAction", () => {
  it("pins a file", async () => {
    const client = createMockSupabaseClient({
      class_files: [
        { data: { id: "file-1", class_id: CLASS_ID }, error: null },
        { data: { ...FILE_ROW, pinned: true }, error: null },
      ],
    });
    vi.mocked(createClient).mockResolvedValue(client as never);

    const result = await updateClassFileAction("file-1", { pinned: true });

    expect(result.pinned).toBe(true);
    const updateCall = client.from.mock.results[1].value.update.mock.calls[0][0];
    expect(updateCall).toEqual({ pinned: true });
  });

  it("refuses an empty title", async () => {
    const client = createMockSupabaseClient({
      class_files: { data: { id: "file-1", class_id: CLASS_ID }, error: null },
    });
    vi.mocked(createClient).mockResolvedValue(client as never);
    await expect(updateClassFileAction("file-1", { title: " " })).rejects.toThrow(ExpectedError);
  });
});

describe("deleteClassFileAction", () => {
  it("deletes the row and its stored PDF", async () => {
    const client = createMockSupabaseClient({
      class_files: [
        { data: { id: "file-1", storage_path: PATH }, error: null },
        { data: null, error: null },
      ],
    });
    const remove = withStorage(client);
    vi.mocked(createClient).mockResolvedValue(client as never);

    await deleteClassFileAction("file-1");

    expect(client.from.mock.results[1].value.delete).toHaveBeenCalled();
    expect(remove).toHaveBeenCalledWith([PATH]);
  });

  it("does nothing for a file that isn't there", async () => {
    const client = createMockSupabaseClient({ class_files: { data: null, error: null } });
    const remove = withStorage(client);
    vi.mocked(createClient).mockResolvedValue(client as never);

    await deleteClassFileAction("gone");

    expect(remove).not.toHaveBeenCalled();
  });
});

describe("discardClassFileUploadAction", () => {
  it("removes an unsaved upload in the teacher's folder", async () => {
    const client = createMockSupabaseClient({ class_files: { data: null, error: null } });
    const remove = withStorage(client);
    vi.mocked(createClient).mockResolvedValue(client as never);

    await discardClassFileUploadAction(CLASS_ID, PATH);

    expect(remove).toHaveBeenCalledWith([PATH]);
  });

  it("keeps an upload a post points at, and ignores other folders", async () => {
    const client = createMockSupabaseClient({ class_files: { data: { id: "file-1" }, error: null } });
    const remove = withStorage(client);
    vi.mocked(createClient).mockResolvedValue(client as never);

    await discardClassFileUploadAction(CLASS_ID, PATH);
    await discardClassFileUploadAction(CLASS_ID, `x/${CLASS_ID}/a0000000-0000-0000-0000-00000000000a.pdf`);

    expect(remove).not.toHaveBeenCalled();
  });
});

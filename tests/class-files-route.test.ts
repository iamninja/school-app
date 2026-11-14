import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@/lib/supabase/server";
import { GET } from "@/app/api/class-files/[id]/route";
import { createMockSupabaseClient } from "./support/mock-supabase";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const ID = "f0000000-0000-0000-0000-000000000001";
const call = (id = ID, query = "") =>
  GET(new Request(`https://app.test/api/class-files/${id}${query}`), {
    params: Promise.resolve({ id }),
  });

function clientWith(row: unknown, user: { id: string } | null = { id: "student-user" }) {
  const client = createMockSupabaseClient({ class_files: { data: row, error: null } }, user);
  const createSignedUrl = vi.fn(async () => ({
    data: { signedUrl: "https://storage.test/signed?token=x" },
    error: null,
  }));
  client.storage = { from: vi.fn(() => ({ createSignedUrl })) };
  vi.mocked(createClient).mockResolvedValue(client as never);
  return { client, createSignedUrl };
}

beforeEach(() => vi.clearAllMocks());

describe("GET /api/class-files/[id]", () => {
  it("needs a login", async () => {
    clientWith(null, null);
    expect((await call()).status).toBe(401);
  });

  it("404s a file the user can't see (row-level security hides it)", async () => {
    clientWith(null);
    expect((await call()).status).toBe(404);
  });

  it("404s a malformed id without asking the database", async () => {
    const { client } = clientWith(null);
    expect((await call("../../etc")).status).toBe(404);
    expect(client.from).not.toHaveBeenCalled();
  });

  it("redirects a PDF to a short-lived signed URL", async () => {
    const { createSignedUrl } = clientWith({
      kind: "file",
      storage_path: "t/c/a.pdf",
      file_name: "Φυλλάδιο.pdf",
      url: null,
    });
    const response = await call();
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://storage.test/signed?token=x");
    expect(createSignedUrl).toHaveBeenCalledWith("t/c/a.pdf", 60, undefined);
  });

  it("asks for a download under the file's name with ?download=1", async () => {
    const { createSignedUrl } = clientWith({
      kind: "file",
      storage_path: "t/c/a.pdf",
      file_name: "Φυλλάδιο.pdf",
      url: null,
    });
    await call(ID, "?download=1");
    expect(createSignedUrl).toHaveBeenCalledWith("t/c/a.pdf", 60, { download: "Φυλλάδιο.pdf" });
  });

  it("redirects a link to the link", async () => {
    clientWith({ kind: "link", storage_path: null, file_name: null, url: "https://drive.google.com/x" });
    const response = await call();
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://drive.google.com/x");
  });
});

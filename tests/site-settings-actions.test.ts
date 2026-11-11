import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@/lib/supabase/server";
import { requireTeacher } from "@/lib/auth/require-teacher";
import { ExpectedError } from "@/lib/expected-error";
import { updateSiteSettingsAction } from "@/app/protected/teacher/site-settings-actions";
import { createMockSupabaseClient } from "./support/mock-supabase";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/auth/require-teacher", () => ({ requireTeacher: vi.fn() }));
const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (path: string) => revalidatePath(path) }));

describe("updateSiteSettingsAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireTeacher).mockResolvedValue(undefined);
  });

  it("saves the switches and a tidied message, then refreshes the front page", async () => {
    const client = createMockSupabaseClient({ site_settings: { data: { christmas_mode: "on" }, error: null } });
    vi.mocked(createClient).mockResolvedValue(client as never);

    await updateSiteSettingsAction({ christmas_mode: "on", christmas_hat: false, christmas_message: "  Καλά   Χριστούγεννα! " });

    const chain = client.from.mock.results[0].value;
    expect(chain.update).toHaveBeenCalledWith({
      updated_at: expect.any(String),
      christmas_mode: "on",
      christmas_hat: false,
      christmas_message: "Καλά Χριστούγεννα!",
    });
    expect(chain.eq).toHaveBeenCalledWith("id", 1);
    expect(revalidatePath).toHaveBeenCalledWith("/");
  });

  it("stores an empty message as none, so the default shows", async () => {
    const client = createMockSupabaseClient({ site_settings: { data: {}, error: null } });
    vi.mocked(createClient).mockResolvedValue(client as never);

    await updateSiteSettingsAction({ christmas_message: "   " });

    expect(client.from.mock.results[0].value.update).toHaveBeenCalledWith(
      expect.objectContaining({ christmas_message: null }),
    );
  });

  it.each([
    [{ christmas_mode: "sometimes" }],
    [{ christmas_message: "x".repeat(161) }],
  ])("refuses %o before writing", async (changes) => {
    const client = createMockSupabaseClient({});
    vi.mocked(createClient).mockResolvedValue(client as never);
    await expect(updateSiteSettingsAction(changes as never)).rejects.toThrow(ExpectedError);
    expect(client.from).not.toHaveBeenCalled();
  });

  it("needs a teacher", async () => {
    const client = createMockSupabaseClient({});
    vi.mocked(createClient).mockResolvedValue(client as never);
    vi.mocked(requireTeacher).mockRejectedValue(new Error("Not a teacher"));
    await expect(updateSiteSettingsAction({ christmas_hat: true })).rejects.toThrow("Not a teacher");
    expect(client.from).not.toHaveBeenCalled();
  });
});

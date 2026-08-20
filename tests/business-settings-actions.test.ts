import { describe, expect, it, vi, beforeEach } from "vitest";

process.env.BUSINESS_SECRETS_KEY = Buffer.alloc(32, 3).toString("base64");

import { createClient } from "@/lib/supabase/server";
import { requireTeacher } from "@/lib/auth/require-teacher";
import * as businessSettingsActions from "@/app/protected/teacher/business-settings-actions";
import { createMockSupabaseClient } from "./support/mock-supabase";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
  createServiceRoleClient: vi.fn(),
}));

vi.mock("@/lib/auth/require-teacher", () => ({
  requireTeacher: vi.fn(),
}));

vi.mock("@/lib/integrations/credentials", () => ({
  getCredentialStatus: vi.fn(async () => ({
    hasValue: true,
    lastFour: "1234",
    updatedAt: "2026-08-20T00:00:00Z",
    lastUsedAt: null,
  })),
  setCredential: vi.fn(async () => {}),
  deleteCredential: vi.fn(async () => {}),
}));

import {
  deleteCredential,
  setCredential,
} from "@/lib/integrations/credentials";

/**
 * The export-surface test below is the important one. Every exported async
 * function in a "use server" module becomes a callable HTTP endpoint, so
 * accidentally exporting anything that returns a decrypted credential from
 * this file would ship a public, unauthenticated credential oracle. This
 * turns "we agreed not to do that" into something CI enforces.
 */
describe("business-settings-actions - export surface", () => {
  it("exports only the intended actions, and nothing that returns a secret", () => {
    expect(Object.keys(businessSettingsActions).sort()).toEqual([
      "deleteCredentialAction",
      "getBusinessSettingsAction",
      "setCredentialAction",
      "updateBusinessProfileAction",
      "updateIntegrationSettingsAction",
    ]);
  });

  it("does not re-export the decryption helper under any name", () => {
    const exported = Object.values(businessSettingsActions);
    for (const value of exported) {
      expect(String(value)).not.toContain("decryptSecret");
    }
  });
});

describe("business-settings-actions - authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireTeacher).mockResolvedValue(undefined);
  });

  it("setCredentialAction refuses an unauthenticated caller before touching the credential store", async () => {
    vi.mocked(createClient).mockResolvedValue(
      createMockSupabaseClient({}, null) as never,
    );

    await expect(
      businessSettingsActions.setCredentialAction(
        "aade_mydata",
        "subscription_key",
        "sandbox",
        "value",
      ),
    ).rejects.toThrow("Not authenticated");

    expect(setCredential).not.toHaveBeenCalled();
  });

  it("setCredentialAction refuses a non-teacher before touching the credential store", async () => {
    vi.mocked(createClient).mockResolvedValue(
      createMockSupabaseClient({}, { id: "student-1" }) as never,
    );
    vi.mocked(requireTeacher).mockRejectedValue(
      new Error("Not authorized as a teacher"),
    );

    await expect(
      businessSettingsActions.setCredentialAction(
        "aade_mydata",
        "subscription_key",
        "sandbox",
        "value",
      ),
    ).rejects.toThrow("Not authorized as a teacher");

    // The service-role client underneath bypasses RLS entirely, so this
    // gate is the only authorization on the path - not redundant ceremony.
    expect(setCredential).not.toHaveBeenCalled();
  });

  it("deleteCredentialAction refuses a non-teacher before deleting anything", async () => {
    vi.mocked(createClient).mockResolvedValue(
      createMockSupabaseClient({}, { id: "parent-1" }) as never,
    );
    vi.mocked(requireTeacher).mockRejectedValue(
      new Error("Not authorized as a teacher"),
    );

    await expect(
      businessSettingsActions.deleteCredentialAction(
        "aade_mydata",
        "subscription_key",
        "sandbox",
      ),
    ).rejects.toThrow("Not authorized as a teacher");

    expect(deleteCredential).not.toHaveBeenCalled();
  });

  it("setCredentialAction returns status only, never the value it was given", async () => {
    vi.mocked(createClient).mockResolvedValue(
      createMockSupabaseClient({}, { id: "teacher-1" }) as never,
    );

    const result = await businessSettingsActions.setCredentialAction(
      "aade_mydata",
      "subscription_key",
      "sandbox",
      "super-secret-value",
    );

    expect(setCredential).toHaveBeenCalledWith(
      "aade_mydata",
      "subscription_key",
      "sandbox",
      "super-secret-value",
    );
    expect(JSON.stringify(result)).not.toContain("super-secret-value");
    expect(result).toEqual({
      hasValue: true,
      lastFour: "1234",
      updatedAt: "2026-08-20T00:00:00Z",
      lastUsedAt: null,
    });
  });
});

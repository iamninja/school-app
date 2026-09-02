import { describe, expect, it, vi, beforeEach } from "vitest";

import { createServiceRoleClient } from "@/lib/supabase/server";
import { getDecryptedCredentialForEnvironment } from "@/lib/integrations/credentials";
import {
  sendInvoiceXml,
  requestDocs,
  verifyReceiptMark,
} from "@/lib/mydata/client";
import { createMockSupabaseClient } from "./support/mock-supabase";

vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: vi.fn(),
}));

vi.mock("@/lib/integrations/credentials", () => ({
  getDecryptedCredentialForEnvironment: vi.fn(async () => "user-id"),
}));

/**
 * Production got a real HTTP 404 from AADE (2026-09-01) because SendInvoices
 * was called at https://mydatapi.aade.gr/SendInvoices - missing the /myDATA
 * prefix the official §4.2.1 doc requires in production (sandbox has no such
 * prefix). These lock in the exact URL per environment for every ERP call in
 * this file so that regresses silently the same way again.
 */
describe("lib/mydata/client - endpoint URLs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getDecryptedCredentialForEnvironment).mockResolvedValue(
      "user-id",
    );
    global.fetch = vi.fn(async () =>
      new Response("<ResponseDoc><statusCode>Success</statusCode></ResponseDoc>", {
        status: 200,
      }),
    );
  });

  it("sendInvoiceXml posts to the sandbox URL with no /myDATA prefix", async () => {
    vi.mocked(createServiceRoleClient).mockReturnValue(
      createMockSupabaseClient({
        integration_settings: {
          data: { active_environment: "sandbox", enabled: true },
          error: null,
        },
      }) as never,
    );

    await sendInvoiceXml("<InvoicesDoc/>");

    expect(fetch).toHaveBeenCalledWith(
      "https://mydataapidev.aade.gr/SendInvoices",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("sendInvoiceXml posts to the production URL WITH the /myDATA prefix", async () => {
    vi.mocked(createServiceRoleClient).mockReturnValue(
      createMockSupabaseClient({
        integration_settings: {
          data: { active_environment: "production", enabled: true },
          error: null,
        },
      }) as never,
    );

    await sendInvoiceXml("<InvoicesDoc/>");

    expect(fetch).toHaveBeenCalledWith(
      "https://mydatapi.aade.gr/myDATA/SendInvoices",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("requestDocs GETs the production URL with the /myDATA prefix", async () => {
    await requestDocs({ mark: "0", environment: "production" });

    expect(fetch).toHaveBeenCalledWith(
      expect.stringMatching(
        /^https:\/\/mydatapi\.aade\.gr\/myDATA\/RequestDocs\?/,
      ),
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("requestDocs GETs the sandbox URL with no prefix", async () => {
    await requestDocs({ mark: "0", environment: "sandbox" });

    expect(fetch).toHaveBeenCalledWith(
      expect.stringMatching(
        /^https:\/\/mydataapidev\.aade\.gr\/RequestDocs\?/,
      ),
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("verifyReceiptMark GETs the production URL with the /myDATA prefix", async () => {
    await verifyReceiptMark("400001970004561", "production");

    expect(fetch).toHaveBeenCalledWith(
      expect.stringMatching(
        /^https:\/\/mydatapi\.aade\.gr\/myDATA\/RequestTransmittedDocs\?/,
      ),
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("verifyReceiptMark GETs the sandbox URL with no prefix", async () => {
    await verifyReceiptMark("1", "sandbox");

    expect(fetch).toHaveBeenCalledWith(
      expect.stringMatching(
        /^https:\/\/mydataapidev\.aade\.gr\/RequestTransmittedDocs\?/,
      ),
      expect.objectContaining({ method: "GET" }),
    );
  });
});

/**
 * 2026-09-02: a receipt's URL was built for production, but the credentials
 * actually sent were very likely sandbox's - because sendInvoiceXml used to
 * call getDecryptedCredential (which does its OWN independent read of
 * active_environment) instead of threading through the single environment
 * value it had already resolved for the URL. If that DB setting changed
 * between the two reads (e.g. someone flipping the Business tab's toggle
 * mid-request), the URL and the credentials could silently disagree - no
 * error, just a document filed under the wrong ledger. This locks in that
 * sendInvoiceXml only ever does ONE environment resolution, and passes it
 * explicitly to the credential lookup - which cannot race with itself.
 */
describe("lib/mydata/client - sendInvoiceXml resolves environment exactly once", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn(async () =>
      new Response("<ResponseDoc><statusCode>Success</statusCode></ResponseDoc>", {
        status: 200,
      }),
    );
  });

  it("fetches credentials for the SAME environment used to build the URL", async () => {
    // integration_settings is only ever queried once now (for the URL's
    // environment) - getDecryptedCredentialForEnvironment takes that same
    // value as an explicit parameter rather than re-querying the DB, so
    // there is no longer a second read that could see a different value.
    vi.mocked(createServiceRoleClient).mockReturnValue(
      createMockSupabaseClient({
        integration_settings: {
          data: { active_environment: "production", enabled: true },
          error: null,
        },
      }) as never,
    );
    vi.mocked(getDecryptedCredentialForEnvironment).mockResolvedValue(
      "user-id",
    );

    await sendInvoiceXml("<InvoicesDoc/>");

    expect(fetch).toHaveBeenCalledWith(
      "https://mydatapi.aade.gr/myDATA/SendInvoices",
      expect.anything(),
    );
    expect(getDecryptedCredentialForEnvironment).toHaveBeenCalledWith(
      "aade_mydata",
      "user_id",
      "production",
    );
    expect(getDecryptedCredentialForEnvironment).toHaveBeenCalledWith(
      "aade_mydata",
      "subscription_key",
      "production",
    );
  });
});

/**
 * A "phantom success" (2026-09-01: a real MARK/UID came back from AADE, yet
 * the document never showed up in RequestTransmittedDocs or the myDATA
 * portal) is unauditable after the fact unless the raw response body is
 * kept somewhere - the parsed mark/uid alone can't answer "was there
 * something else in that response we didn't check for". These lock in
 * that every call site actually returns the body it received, for every
 * outcome, so the caller can persist it.
 */
describe("lib/mydata/client - raw response is always returned", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getDecryptedCredentialForEnvironment).mockResolvedValue(
      "user-id",
    );
    vi.mocked(createServiceRoleClient).mockReturnValue(
      createMockSupabaseClient({
        integration_settings: {
          data: { active_environment: "sandbox", enabled: true },
          error: null,
        },
      }) as never,
    );
  });

  it("sendInvoiceXml returns the exact response body on success", async () => {
    const raw =
      "<ResponseDoc><statusCode>Success</statusCode><invoiceMark>1</invoiceMark></ResponseDoc>";
    global.fetch = vi.fn(async () => new Response(raw, { status: 200 }));

    const result = await sendInvoiceXml("<InvoicesDoc/>");

    expect(result.raw).toBe(raw);
  });

  it("sendInvoiceXml returns the exact response body on an HTTP error", async () => {
    const raw = '{ "statusCode": 404, "message": "Resource not found" }';
    global.fetch = vi.fn(async () => new Response(raw, { status: 404 }));

    const result = await sendInvoiceXml("<InvoicesDoc/>");

    expect(result.ok).toBe(false);
    expect(result.raw).toBe(raw);
  });

  it("sendInvoiceXml returns an empty raw body on a network-level failure", async () => {
    global.fetch = vi.fn(async () => {
      throw new Error("network down");
    });

    const result = await sendInvoiceXml("<InvoicesDoc/>");

    expect(result.ok).toBe(false);
    expect(result.raw).toBe("");
  });

  it("verifyReceiptMark returns the exact response body it received", async () => {
    const raw = "<RequestedDoc><invoice><mark>1</mark></invoice></RequestedDoc>";
    global.fetch = vi.fn(async () => new Response(raw, { status: 200 }));

    const result = await verifyReceiptMark("1", "sandbox");

    expect(result.raw).toBe(raw);
  });
});

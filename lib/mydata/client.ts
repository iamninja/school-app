import "server-only";

import { getDecryptedCredential } from "@/lib/integrations/credentials";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * Transport for AADE myDATA SendInvoices.
 *
 * We self-issue, so we use the ERP channel. Note the paths have NO
 * /myDATAProvider/ prefix - that's the separate Provider channel, and
 * sending there would fail. Endpoints are from AADE's own test-URL sheet
 * (docs/mydata-integration.md), not from web search, which had this wrong.
 */

const ENDPOINTS = {
  sandbox: "https://mydataapidev.aade.gr",
  production: "https://mydatapi.aade.gr",
} as const;

const PROVIDER = "aade_mydata";

export interface MyDataSuccess {
  ok: true;
  mark: string;
  uid: string | null;
  qrUrl: string | null;
}

export interface MyDataFailure {
  ok: false;
  /** Safe to persist and show - never contains credentials. */
  error: string;
}

export type MyDataResult = MyDataSuccess | MyDataFailure;

/** Pulls a single tagged value out of AADE's ResponseDoc, namespace-agnostic. */
function extractTag(xml: string, tag: string): string | null {
  const match = xml.match(
    new RegExp(`<(?:[a-zA-Z0-9]+:)?${tag}>([^<]*)</(?:[a-zA-Z0-9]+:)?${tag}>`),
  );
  return match ? match[1].trim() : null;
}

function extractAllTags(xml: string, tag: string): string[] {
  const matches = xml.matchAll(
    new RegExp(
      `<(?:[a-zA-Z0-9]+:)?${tag}>([^<]*)</(?:[a-zA-Z0-9]+:)?${tag}>`,
      "g",
    ),
  );
  return [...matches].map((match) => match[1].trim());
}

/**
 * Parses a ResponseDoc. AADE returns HTTP 200 even for rejected invoices -
 * the real outcome is in statusCode, so a naive `response.ok` check would
 * record a failed filing as a success.
 */
export function parseMyDataResponse(xml: string): MyDataResult {
  const statusCode = extractTag(xml, "statusCode");

  if (statusCode && statusCode.toLowerCase() !== "success") {
    const codes = extractAllTags(xml, "code");
    const messages = extractAllTags(xml, "message");
    const details = messages.length > 0 ? messages : codes;
    return {
      ok: false,
      error: details.length > 0
        ? `myDATA rejected the receipt: ${details.join("; ")}`
        : `myDATA rejected the receipt (status ${statusCode})`,
    };
  }

  const mark = extractTag(xml, "invoiceMark");
  if (!mark) {
    // Without a MARK nothing was actually registered, whatever the status
    // said - treating this as success would be a silent filing gap.
    return {
      ok: false,
      error: "myDATA accepted the request but returned no MARK",
    };
  }

  return {
    ok: true,
    mark,
    uid: extractTag(xml, "invoiceUid"),
    qrUrl: extractTag(xml, "qrUrl"),
  };
}

export async function getActiveMyDataEnvironment(): Promise<
  "sandbox" | "production"
> {
  const { data, error } = await createServiceRoleClient()
    .from("integration_settings")
    .select("active_environment, enabled")
    .eq("provider", PROVIDER)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("myDATA integration is not configured");
  if (!data.enabled) {
    throw new Error(
      "myDATA integration is disabled - enable it in the Business tab first",
    );
  }

  return data.active_environment as "sandbox" | "production";
}

/**
 * POSTs one InvoicesDoc. Never logs or returns the credentials, and never
 * interpolates them into an error - lib/secrets.ts also registers
 * decrypted values with the Sentry scrubber as a backstop.
 */
export async function sendInvoiceXml(xml: string): Promise<MyDataResult> {
  const environment = await getActiveMyDataEnvironment();

  const [userId, subscriptionKey] = await Promise.all([
    getDecryptedCredential(PROVIDER, "user_id"),
    getDecryptedCredential(PROVIDER, "subscription_key"),
  ]);

  let response: Response;
  try {
    response = await fetch(`${ENDPOINTS[environment]}/SendInvoices`, {
      method: "POST",
      headers: {
        "aade-user-id": userId,
        "ocp-apim-subscription-key": subscriptionKey,
        "Content-Type": "application/xml",
      },
      body: xml,
    });
  } catch (error: unknown) {
    // Network-level failure. Deliberately does not echo the error object,
    // which can carry request headers.
    return {
      ok: false,
      error: `Could not reach myDATA (${environment}): ${
        error instanceof Error ? error.message : "network error"
      }`,
    };
  }

  const body = await response.text();

  if (response.status === 401 || response.status === 403) {
    return {
      ok: false,
      error: `myDATA rejected the credentials (HTTP ${response.status}) - check the ${environment} user ID and subscription key.`,
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      error: `myDATA returned HTTP ${response.status}: ${body.slice(0, 500)}`,
    };
  }

  return parseMyDataResponse(body);
}

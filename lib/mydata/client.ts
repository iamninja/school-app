import "server-only";

import {
  getDecryptedCredential,
  getDecryptedCredentialForEnvironment,
} from "@/lib/integrations/credentials";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * Transport for AADE myDATA SendInvoices.
 *
 * We self-issue, so we use the ERP channel. Note the paths have NO
 * /myDATAProvider/ prefix - that's the separate Provider channel, and
 * sending there would fail. Endpoints are from AADE's own test-URL sheet
 * (docs/mydata-integration.md), not from web search, which had this wrong.
 *
 * Production sits under a /myDATA path prefix (confirmed against the
 * official §4.2.1 doc screenshot, 2026-09-01, after a receipt got a real
 * HTTP 404 in production without it); sandbox has no such prefix. Every
 * ERP call must go through baseUrl() below rather than ENDPOINTS directly,
 * or it'll silently 404 in production the same way.
 */

const ENDPOINTS = {
  sandbox: "https://mydataapidev.aade.gr",
  production: "https://mydatapi.aade.gr",
} as const;

function baseUrl(environment: "sandbox" | "production"): string {
  return environment === "production"
    ? `${ENDPOINTS.production}/myDATA`
    : ENDPOINTS.sandbox;
}

const PROVIDER = "aade_mydata";

export interface MyDataSuccess {
  ok: true;
  mark: string;
  uid: string | null;
  qrUrl: string | null;
  /** Raw response body, for the audit trail - see mydata_submission_log. */
  raw: string;
  /**
   * A non-empty <code>/<message> segment found alongside a MARK, even
   * though the top-level status read as accepted - AADE returning a MARK
   * is not proof the whole response was clean (2026-09-01: a receipt got
   * a real MARK/UID that never surfaced in RequestTransmittedDocs or the
   * myDATA portal). Null when the response carried no such segment.
   */
  warning: string | null;
}

export interface MyDataFailure {
  ok: false;
  /** Safe to persist and show - never contains credentials. */
  error: string;
  /** Raw response body, empty when the request never got a response at all. */
  raw: string;
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
 * Pulls every <tag>...</tag> INNER XML (not just leaf text) out of a
 * string, for scoping a nested extraction - e.g. RequestedDoc's
 * <issuer><vatNumber> and <counterpart><vatNumber> share a tag name, so
 * extractTag alone can't tell them apart. Extract the block first, then
 * extractTag *within* that substring.
 */
function extractBlocks(xml: string, tag: string): string[] {
  const matches = xml.matchAll(
    new RegExp(
      `<(?:[a-zA-Z0-9]+:)?${tag}>([\\s\\S]*?)</(?:[a-zA-Z0-9]+:)?${tag}>`,
      "g",
    ),
  );
  return [...matches].map((match) => match[1]);
}

function toNumberOrNull(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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
      raw: xml,
    };
  }

  const mark = extractTag(xml, "invoiceMark");
  if (!mark) {
    // Without a MARK nothing was actually registered, whatever the status
    // said - treating this as success would be a silent filing gap.
    return {
      ok: false,
      error: "myDATA accepted the request but returned no MARK",
      raw: xml,
    };
  }

  // A MARK being present is not proof the rest of the response was clean -
  // check for an embedded error/warning segment regardless of statusCode,
  // and surface it rather than silently discard it.
  const codes = extractAllTags(xml, "code");
  const messages = extractAllTags(xml, "message");
  const details = messages.length > 0 ? messages : codes;

  return {
    ok: true,
    mark,
    uid: extractTag(xml, "invoiceUid"),
    qrUrl: extractTag(xml, "qrUrl"),
    raw: xml,
    warning:
      details.length > 0
        ? `myDATA returned a MARK but also flagged: ${details.join("; ")}`
        : null,
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
    response = await fetch(`${baseUrl(environment)}/SendInvoices`, {
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
      raw: "",
    };
  }

  const body = await response.text();

  if (response.status === 401 || response.status === 403) {
    return {
      ok: false,
      error: `myDATA rejected the credentials (HTTP ${response.status}) - check the ${environment} user ID and subscription key.`,
      raw: body,
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      error: `myDATA returned HTTP ${response.status}: ${body.slice(0, 500)}`,
      raw: body,
    };
  }

  return parseMyDataResponse(body);
}

export interface RequestedInvoice {
  uid: string;
  mark: string;
  issuerVatNumber: string | null;
  counterpartVatNumber: string | null;
  /** As returned by AADE - yyyy-MM-dd. */
  issueDate: string | null;
  invoiceType: string | null;
  currency: string | null;
  totalNetValue: number | null;
  totalVatAmount: number | null;
  totalGrossValue: number | null;
  paymentMethods: { type: number; amount: number }[];
  qrCodeUrl: string | null;
  downloadingInvoiceUrl: string | null;
}

export interface RequestDocsResult {
  ok: boolean;
  status?: number;
  error?: string;
  invoices?: RequestedInvoice[];
}

/**
 * Parses RequestedDoc's <invoicesDoc><invoice>...</invoice></invoicesDoc>
 * list. Verified against a real production response (2026-08-24): every
 * field here was present in that document, but several are declared
 * optional in the schema (§6.2), so each lookup tolerates being absent
 * rather than throwing.
 */
export function parseRequestedDocs(xml: string): RequestedInvoice[] {
  const invoicesDocBlocks = extractBlocks(xml, "invoicesDoc");

  return invoicesDocBlocks.flatMap((invoicesDocXml) =>
    extractBlocks(invoicesDocXml, "invoice").map((invoiceXml) => {
      const issuerBlock = extractBlocks(invoiceXml, "issuer")[0] ?? "";
      const counterpartBlock = extractBlocks(invoiceXml, "counterpart")[0] ?? "";
      const headerBlock = extractBlocks(invoiceXml, "invoiceHeader")[0] ?? "";
      const summaryBlock = extractBlocks(invoiceXml, "invoiceSummary")[0] ?? "";
      const paymentMethods = extractBlocks(
        invoiceXml,
        "paymentMethodDetails",
      ).map((block) => ({
        type: Number(extractTag(block, "type")),
        amount: Number(extractTag(block, "amount")),
      }));

      return {
        uid: extractTag(invoiceXml, "uid") ?? "",
        mark: extractTag(invoiceXml, "mark") ?? "",
        issuerVatNumber: extractTag(issuerBlock, "vatNumber"),
        counterpartVatNumber: extractTag(counterpartBlock, "vatNumber"),
        issueDate: extractTag(headerBlock, "issueDate"),
        invoiceType: extractTag(headerBlock, "invoiceType"),
        currency: extractTag(headerBlock, "currency"),
        totalNetValue: toNumberOrNull(extractTag(summaryBlock, "totalNetValue")),
        totalVatAmount: toNumberOrNull(
          extractTag(summaryBlock, "totalVatAmount"),
        ),
        totalGrossValue: toNumberOrNull(
          extractTag(summaryBlock, "totalGrossValue"),
        ),
        paymentMethods,
        qrCodeUrl: extractTag(invoiceXml, "qrCodeUrl"),
        downloadingInvoiceUrl: extractTag(invoiceXml, "downloadingInvoiceUrl"),
      };
    }),
  );
}

/**
 * GET RequestDocs - documents OTHER parties (suppliers, customers) have
 * submitted to myDATA that reference this business's ΑΦΜ, i.e. what a
 * supplier's own invoice-to-us looks like from AADE's side with no manual
 * upload on our end. `mark` is an exclusive lower bound (same semantics
 * as verifyReceiptMark above) - pass "0" to fetch everything.
 *
 * Verified against production (2026-08-24) - see parseRequestedDocs.
 */
export async function requestDocs(params: {
  mark: string;
  dateFrom?: string; // dd/MM/yyyy
  dateTo?: string; // dd/MM/yyyy
  environment: "sandbox" | "production";
}): Promise<RequestDocsResult> {
  const { mark, dateFrom, dateTo, environment } = params;

  const [userId, subscriptionKey] = await Promise.all([
    getDecryptedCredentialForEnvironment(PROVIDER, "user_id", environment),
    getDecryptedCredentialForEnvironment(
      PROVIDER,
      "subscription_key",
      environment,
    ),
  ]);

  const query = new URLSearchParams({ mark });
  if (dateFrom) query.set("dateFrom", dateFrom);
  if (dateTo) query.set("dateTo", dateTo);

  let response: Response;
  try {
    response = await fetch(`${baseUrl(environment)}/RequestDocs?${query.toString()}`, {
      method: "GET",
      headers: {
        "aade-user-id": userId,
        "ocp-apim-subscription-key": subscriptionKey,
      },
    });
  } catch (error: unknown) {
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
      status: response.status,
      error: `myDATA rejected the credentials (HTTP ${response.status}) for the ${environment} environment.`,
    };
  }
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: `myDATA returned HTTP ${response.status}: ${body.slice(0, 500)}`,
    };
  }

  return {
    ok: true,
    status: response.status,
    invoices: parseRequestedDocs(body),
  };
}

export interface MyDataVerification {
  found: boolean;
  invoiceType: string | null;
  grossValue: string | null;
}

/**
 * Re-asks AADE whether it actually holds a given MARK, via
 * RequestTransmittedDocs ("documents I myself submitted"). This is what
 * keeps "our database says submitted" and "AADE actually has this
 * filing" from silently drifting apart - a MARK we stored is not proof
 * of anything until confirmed independently.
 *
 * Verifies against the SPECIFIC environment the receipt was filed to,
 * never the currently active one - the two can differ (e.g. after a
 * sandbox -> production cutover), and asking the wrong environment about
 * an old MARK would incorrectly report it missing.
 *
 * mark is an EXCLUSIVE lower bound in AADE's own semantics (spec §4.2.7:
 * "returns entries with MARK greater than the parameter"), so mark-1
 * combined with maxMark=mark bounds the query to exactly this one record.
 */
export async function verifyReceiptMark(
  mark: string,
  environment: "sandbox" | "production",
): Promise<MyDataResult & { verification?: MyDataVerification }> {
  const [userId, subscriptionKey] = await Promise.all([
    getDecryptedCredentialForEnvironment(PROVIDER, "user_id", environment),
    getDecryptedCredentialForEnvironment(
      PROVIDER,
      "subscription_key",
      environment,
    ),
  ]);

  const from = (BigInt(mark) - BigInt(1)).toString();
  const url = `${baseUrl(environment)}/RequestTransmittedDocs?mark=${from}&maxMark=${mark}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: {
        "aade-user-id": userId,
        "ocp-apim-subscription-key": subscriptionKey,
      },
    });
  } catch (error: unknown) {
    return {
      ok: false,
      error: `Could not reach myDATA (${environment}): ${
        error instanceof Error ? error.message : "network error"
      }`,
      raw: "",
    };
  }

  const body = await response.text();

  if (response.status === 401 || response.status === 403) {
    return {
      ok: false,
      error: `myDATA rejected the credentials (HTTP ${response.status}) for the ${environment} environment.`,
      raw: body,
    };
  }
  if (!response.ok) {
    return {
      ok: false,
      error: `myDATA returned HTTP ${response.status}: ${body.slice(0, 500)}`,
      raw: body,
    };
  }

  const found = body.includes(`<mark>${mark}</mark>`);

  return {
    ok: true,
    mark,
    uid: extractTag(body, "uid"),
    qrUrl: extractTag(body, "qrCodeUrl"),
    raw: body,
    // RequestTransmittedDocs' RequestedDoc shape has no error/code segment
    // analogous to SendInvoices' ResponseDoc - nothing to flag here.
    warning: null,
    verification: {
      found,
      invoiceType: found ? extractTag(body, "invoiceType") : null,
      grossValue: found ? extractTag(body, "totalGrossValue") : null,
    },
  };
}

import type { ErrorEvent } from "@sentry/nextjs";

// Substring match (case-insensitive) against object keys - deliberately
// broad (e.g. "name" also catches "className", "familyName") since a
// false-positive redaction is fine, a leaked child's name/email/phone
// isn't. Defense-in-depth: this app doesn't currently attach PII to
// Sentry events on purpose (sendDefaultPii: false, no Sentry.setUser
// calls), this just makes sure a future `captureException(err, { extra })`
// call can't accidentally leak one through.
//
// Credential-shaped keys are matched by category rather than by naming
// each provider's header (aade-user-id, Viva Wallet, Piraeus, ...) - a
// hand-maintained per-provider list always lags the next integration.
const DENYLIST_SUBSTRINGS = [
  "email",
  "phone",
  "name",
  "address",
  "afm",
  "tax",
  "vat",
  "postal",
  "doy",
  "secret",
  "key",
  "token",
  "credential",
  "subscription",
  "authorization",
];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function scrubValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(scrubValue);
  }
  if (isPlainObject(value)) {
    return scrubObject(value);
  }
  return value;
}

function scrubObject(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    if (DENYLIST_SUBSTRINGS.some((needle) => lowerKey.includes(needle))) {
      result[key] = "[redacted]";
    } else {
      result[key] = scrubValue(value);
    }
  }
  return result;
}

/** Scrubs known-PII field names out of a Sentry event before it's sent. */
export function scrubPii(event: ErrorEvent): ErrorEvent {
  if (event.extra) {
    event.extra = scrubObject(event.extra);
  }
  if (event.contexts) {
    event.contexts = scrubObject(event.contexts) as ErrorEvent["contexts"];
  }
  if (event.request) {
    // Dropped wholesale, never key-scrubbed. A captured request body is a
    // raw string, and a server action's body is a positional array with no
    // key names to match against - so DENYLIST_SUBSTRINGS can't help here.
    // Bodies carry passwords and API credentials; nothing in this app has
    // ever been debugged from one.
    delete event.request.data;
    // Same reasoning: the cookie header carries the Supabase auth token
    // (session takeover). The SDK resolves include.headers to true even
    // under sendDefaultPii: false, since the default is a deny-list object
    // rather than false, so clearing request.cookies alone misses it.
    delete event.request.headers;
    if (event.request.cookies) {
      event.request.cookies = {};
    }
  }
  if (event.breadcrumbs) {
    // beforeBreadcrumb only sees breadcrumbs added after init, so the
    // event-level pass is what actually guarantees coverage.
    event.breadcrumbs = event.breadcrumbs.map((breadcrumb) =>
      breadcrumb.data
        ? { ...breadcrumb, data: scrubObject(breadcrumb.data) }
        : breadcrumb,
    );
  }
  if (event.user) {
    event.user = undefined;
  }
  return event;
}

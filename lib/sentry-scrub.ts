import type { ErrorEvent } from "@sentry/nextjs";

// Substring match (case-insensitive) against object keys - deliberately
// broad (e.g. "name" also catches "className", "familyName") since a
// false-positive redaction is fine, a leaked child's name/email/phone
// isn't. Defense-in-depth: this app doesn't currently attach PII to
// Sentry events on purpose (sendDefaultPii: false, no Sentry.setUser
// calls), this just makes sure a future `captureException(err, { extra })`
// call can't accidentally leak one through.
const DENYLIST_SUBSTRINGS = ["email", "phone", "name", "address"];

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
    if (event.request.data) {
      event.request.data = scrubValue(event.request.data);
    }
    if (event.request.cookies) {
      event.request.cookies = {};
    }
  }
  if (event.user) {
    event.user = undefined;
  }
  return event;
}

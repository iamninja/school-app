/**
 * Marks an error as an expected, user-facing outcome (e.g. "this email is
 * already registered, use Existing family instead") rather than a bug.
 * Server actions throw these the same way as any other error - the
 * difference is Sentry's beforeSend hook (instrumentation.ts) skips
 * reporting them, so normal validation flows don't show up as false-alarm
 * production errors.
 *
 * WHY THE DIGEST: in a production build Next.js/React replace the message of
 * ANY error thrown from a server action with a generic one ("An error
 * occurred in the Server Components render... omitted in production builds",
 * minified as React error #441) and send the client only a `digest`. That
 * made every friendly validation message invisible in production (they only
 * showed on the dev server). Next keeps a digest that is already set on the
 * thrown error (create-error-handler.js: "If the error already has a digest,
 * respect the original digest"), so the message is carried in the digest and
 * read back on the client by getErrorMessage(). Only ExpectedError does this -
 * unexpected errors (raw database errors etc.) stay masked on purpose, since
 * their messages can leak internals.
 */
export const EXPECTED_ERROR_DIGEST_PREFIX = "expected:";

// Long enough for the longest user-facing message we throw (an AADE rejection
// text is the longest), short enough to keep the response small.
const MAX_MESSAGE_LENGTH = 1000;

export class ExpectedError extends Error {
  digest: string;

  constructor(message?: string) {
    super(message);
    this.digest =
      EXPECTED_ERROR_DIGEST_PREFIX +
      encodeURIComponent((message ?? "").slice(0, MAX_MESSAGE_LENGTH));
  }
}

/**
 * The text to show the user for an error caught around a server action.
 * Works in every environment: an ExpectedError's own message survives the
 * production masking through its digest; anything else falls back to the
 * error's message (full in development, generic in production) and then to
 * `fallback` for non-Error values.
 */
export function getErrorMessage(error: unknown, fallback: string): string {
  const digest =
    typeof error === "object" && error !== null
      ? (error as { digest?: unknown }).digest
      : undefined;

  if (
    typeof digest === "string" &&
    digest.startsWith(EXPECTED_ERROR_DIGEST_PREFIX)
  ) {
    try {
      return decodeURIComponent(
        digest.slice(EXPECTED_ERROR_DIGEST_PREFIX.length),
      );
    } catch {
      // A malformed digest should never stop the real message showing.
    }
  }

  return error instanceof Error ? error.message : fallback;
}

/**
 * Marks an error as an expected, user-facing outcome (e.g. "this email is
 * already registered, use Existing family instead") rather than a bug.
 * Server actions throw these the same way as any other error - the
 * difference is Sentry's beforeSend hook (instrumentation.ts) skips
 * reporting them, so normal validation flows don't show up as false-alarm
 * production errors.
 */
export class ExpectedError extends Error {}

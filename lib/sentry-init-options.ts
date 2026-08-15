import type { ErrorEvent, EventHint } from "@sentry/nextjs";
import { ExpectedError } from "@/lib/expected-error";
import { scrubPii } from "@/lib/sentry-scrub";

/**
 * Shared Sentry.init() options for the client, server, and edge runtimes
 * (instrumentation-client.ts, sentry.server.config.ts, sentry.edge.config.ts).
 * Error tracking only - no session replay (this app handles children's
 * data, recording sessions needs its own deliberate decision, not a
 * default-on SDK feature) and no performance tracing (tracesSampleRate: 0),
 * which also keeps free-tier usage to just what we actually need.
 */
export function sentryInitOptions() {
  return {
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.VERCEL_ENV ?? "development",
    sendDefaultPii: false,
    tracesSampleRate: 0,
    beforeSend(event: ErrorEvent, hint: EventHint) {
      if (hint.originalException instanceof ExpectedError) {
        return null;
      }
      return scrubPii(event);
    },
  };
}

import type { Breadcrumb, ErrorEvent, EventHint, init } from "@sentry/nextjs";
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
// Sentry v11 dropped `sendDefaultPii` for `dataCollection`, whose defaults
// collect MORE than v10 did (user info, cookies, headers, request/response
// bodies, query data). So every category is set here explicitly, off -
// stricter than v10's defaults (which kept stack frame local variables
// and header deny-lists): local variables can hold a student's name or a
// decrypted credential, and nothing here has ever been debugged from
// them. URL query params keep v10's deny-list baseline, so a broken link
// is still recognisable. scrubPii (beforeSend) stays as the second layer.
// Exported for tests/sentry-scrub.test.ts.
type DataCollection = NonNullable<NonNullable<Parameters<typeof init>[0]>["dataCollection"]>;

export const SENTRY_DATA_COLLECTION = {
  userInfo: false,
  cookies: false,
  httpHeaders: { request: false, response: false },
  httpBodies: [],
  urlQueryParams: { deny: ["forwarded", "-ip", "remote-", "via", "-user", "token", "code", "key"] },
  graphQL: { document: false, variables: false },
  genAI: { inputs: false, outputs: false },
  mcp: { inputs: false, outputs: false },
  databaseQueryData: false,
  queues: false,
  stackFrameVariables: false,
} satisfies DataCollection;

export function sentryInitOptions() {
  return {
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.VERCEL_ENV ?? "development",
    dataCollection: SENTRY_DATA_COLLECTION,
    tracesSampleRate: 0,
    beforeSend(event: ErrorEvent, hint: EventHint) {
      if (hint.originalException instanceof ExpectedError) {
        return null;
      }
      return scrubPii(event);
    },
    beforeBreadcrumb(breadcrumb: Breadcrumb) {
      // consoleIntegration() is on by default in the Node SDK, and this
      // codebase logs inside server actions - one console.error(err) in an
      // integration client would ship whatever the error carries. Nothing
      // here has ever been debugged from a console breadcrumb.
      if (breadcrumb.category === "console") {
        return null;
      }
      return breadcrumb;
    },
  };
}

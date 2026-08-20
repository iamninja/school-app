import * as Sentry from "@sentry/nextjs";
import { sentryInitOptions } from "@/lib/sentry-init-options";

// maxIncomingRequestBodySize defaults to "medium" (10KB) and is gated only
// on !== "none" - NOT on sendDefaultPii - so request bodies reach Sentry
// even with PII disabled. Server action bodies carry passwords
// (signUpStudentAction/signUpParentAction) and, later, API credentials.
// Lives here rather than in the shared sentryInitOptions() because the
// browser SDK has no httpIntegration. scrubPii also drops request.data
// unconditionally, so this regressing alone isn't enough to leak.
Sentry.init({
  ...sentryInitOptions(),
  integrations: [
    Sentry.httpIntegration({
      disableIncomingRequestSpans: true,
      maxIncomingRequestBodySize: "none",
    }),
  ],
});

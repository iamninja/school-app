import * as Sentry from "@sentry/nextjs";
import { sentryInitOptions } from "@/lib/sentry-init-options";

// maxRequestBodySize (v10: maxIncomingRequestBodySize) is set to "none" on
// top of dataCollection.httpBodies: [] - in v10 it defaulted to "medium"
// (10KB) and ignored sendDefaultPii, so request bodies reached Sentry even
// with PII disabled; keep this switch off whatever the defaults do next.
// Server action bodies carry passwords (signUpStudentAction/
// signUpParentAction) and API credentials.
// Lives here rather than in the shared sentryInitOptions() because the
// browser SDK has no httpIntegration. scrubPii also drops request.data
// unconditionally, so this regressing alone isn't enough to leak.
Sentry.init({
  ...sentryInitOptions(),
  integrations: [
    Sentry.httpIntegration({
      disableIncomingRequestSpans: true,
      maxRequestBodySize: "none",
    }),
  ],
});

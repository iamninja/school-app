import * as Sentry from "@sentry/nextjs";
import { sentryInitOptions } from "@/lib/sentry-init-options";

// See sentry.server.config.ts for why request bodies are disabled here.
// The edge runtime has no httpIntegration to override, so scrubPii's
// unconditional request.data delete is what covers this runtime.
Sentry.init(sentryInitOptions());

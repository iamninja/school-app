import * as Sentry from "@sentry/nextjs";
import { sentryInitOptions } from "@/lib/sentry-init-options";

Sentry.init(sentryInitOptions());

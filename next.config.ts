import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  // Only uploads source maps when SENTRY_AUTH_TOKEN is set (Vercel prod
  // build) - a no-op locally, matching how the rest of this config has no
  // effect without env vars set.
  silent: true,
});

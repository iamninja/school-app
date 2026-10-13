import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // The installable app's service worker (public/sw.js). Never cached,
        // so a new version is picked up on the next visit; served as
        // JavaScript with a strict same-origin policy, per the Next.js PWA
        // guide.
        source: "/sw.js",
        headers: [
          {
            key: "Content-Type",
            value: "application/javascript; charset=utf-8",
          },
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          {
            key: "Content-Security-Policy",
            value: "default-src 'self'; script-src 'self'",
          },
        ],
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  // Only uploads source maps when SENTRY_AUTH_TOKEN is set (Vercel prod
  // build) - a no-op locally, matching how the rest of this config has no
  // effect without env vars set.
  silent: true,
});

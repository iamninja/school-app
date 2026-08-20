import { describe, expect, it } from "vitest";
import type { ErrorEvent } from "@sentry/nextjs";
import { scrubPii } from "@/lib/sentry-scrub";
import { sentryInitOptions } from "@/lib/sentry-init-options";

function eventWith(partial: Partial<ErrorEvent>): ErrorEvent {
  return { type: undefined, ...partial } as ErrorEvent;
}

/**
 * These all guard leaks that are completely invisible when the code is
 * working - nothing in the app's behaviour changes if they regress, the
 * data just quietly starts reaching Sentry again.
 */
describe("scrubPii - request data", () => {
  it("drops a raw string request body, which key-based scrubbing can't touch", () => {
    // A Next.js server action body: a positional array, no key names for a
    // denylist to match. This is how a signup password would reach Sentry.
    const event = scrubPii(
      eventWith({
        request: {
          data: '["parent@example.com","hunter2-real-password"]',
        },
      }),
    );

    expect(event.request?.data).toBeUndefined();
  });

  it("drops an object request body too", () => {
    const event = scrubPii(
      eventWith({ request: { data: { password: "hunter2" } } }),
    );

    expect(event.request?.data).toBeUndefined();
  });

  it("drops request headers, which carry the Supabase auth cookie", () => {
    const event = scrubPii(
      eventWith({
        request: {
          headers: {
            cookie: "sb-abcdefg-auth-token=eyJhbGciOiJIUzI1NiJ9.real-session",
            "user-agent": "Mozilla/5.0",
          },
        },
      }),
    );

    expect(event.request?.headers).toBeUndefined();
    expect(JSON.stringify(event)).not.toContain("sb-abcdefg-auth-token");
  });

  it("still clears cookies when they arrive parsed rather than as a header", () => {
    const event = scrubPii(
      eventWith({ request: { cookies: { "sb-abcdefg-auth-token": "real" } } }),
    );

    expect(event.request?.cookies).toEqual({});
  });
});

describe("scrubPii - credential-shaped keys", () => {
  it("redacts credential and tax-identity field names in extra", () => {
    const event = scrubPii(
      eventWith({
        extra: {
          subscriptionKey: "aade-secret-value",
          apiToken: "token-value",
          afm: "123456789",
          doy: "Α ΑΘΗΝΩΝ",
          harmless: "keep me",
        },
      }),
    );

    expect(event.extra).toEqual({
      subscriptionKey: "[redacted]",
      apiToken: "[redacted]",
      afm: "[redacted]",
      doy: "[redacted]",
      harmless: "keep me",
    });
  });

  it("scrubs breadcrumb data", () => {
    const event = scrubPii(
      eventWith({
        breadcrumbs: [
          {
            category: "http",
            data: { subscriptionKey: "aade-secret-value", url: "/api" },
          },
        ],
      }),
    );

    expect(event.breadcrumbs?.[0].data).toEqual({
      subscriptionKey: "[redacted]",
      url: "/api",
    });
  });
});

describe("sentryInitOptions - beforeBreadcrumb", () => {
  it("drops console breadcrumbs entirely", () => {
    const { beforeBreadcrumb } = sentryInitOptions();

    expect(
      beforeBreadcrumb({ category: "console", message: "leaked secret" }),
    ).toBeNull();
  });

  it("keeps non-console breadcrumbs", () => {
    const { beforeBreadcrumb } = sentryInitOptions();
    const breadcrumb = { category: "navigation", message: "/protected" };

    expect(beforeBreadcrumb(breadcrumb)).toBe(breadcrumb);
  });
});

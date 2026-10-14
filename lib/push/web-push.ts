import "server-only";
import webpush from "web-push";

/**
 * The one place that reads the VAPID keys. Missing keys mean notifications
 * are quietly off (the App tab says "not configured") - the same approach
 * as lib/anthropic-client.ts, so a missing env var never breaks the app.
 */
let configured: boolean | undefined;

export function isPushConfigured(): boolean {
  if (configured === undefined) {
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT;
    configured = Boolean(publicKey && privateKey && subject);
    if (configured) {
      webpush.setVapidDetails(subject!, publicKey!, privateKey!);
    }
  }
  return configured;
}

export type PushTarget = { endpoint: string; p256dh: string; auth: string };

export type PushPayload = {
  title: string;
  body: string;
  url: string;
  tag?: string;
};

export type SendResult =
  | { ok: true }
  // `gone`: the push service says this subscription no longer exists
  // (404/410) - the device unsubscribed or the app was removed.
  | { ok: false; gone: boolean; error: string };

/** Sends one notification to one device. Never throws. */
export async function sendPush(
  target: PushTarget,
  payload: PushPayload,
): Promise<SendResult> {
  if (!isPushConfigured()) {
    return { ok: false, gone: false, error: "not configured" };
  }
  try {
    await webpush.sendNotification(
      { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
      JSON.stringify(payload),
      // A day: a phone that's off overnight still gets yesterday evening's
      // reminder in the morning, but nothing older piles up.
      { TTL: 60 * 60 * 24, urgency: "normal" },
    );
    return { ok: true };
  } catch (error: unknown) {
    const statusCode =
      typeof error === "object" && error !== null && "statusCode" in error
        ? Number((error as { statusCode: unknown }).statusCode)
        : undefined;
    return {
      ok: false,
      gone: statusCode === 404 || statusCode === 410,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Test-only: forget the cached configuration so env changes take effect. */
export function __resetPushConfigForTests() {
  configured = undefined;
}

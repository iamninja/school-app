import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { ExpectedError } from "@/lib/expected-error";

/** What PushSubscription.toJSON() gives the browser code. */
export type PushSubscriptionInput = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

const BASE64URL = /^[A-Za-z0-9_-]+=*$/;

/** Checks shape and size; throws an ExpectedError with a Greek message. */
export function parseSubscription(input: unknown): PushSubscriptionInput {
  const invalid = () =>
    new ExpectedError("Η συσκευή έστειλε μη έγκυρα στοιχεία ειδοποιήσεων.");
  if (typeof input !== "object" || input === null) throw invalid();
  const { endpoint, keys } = input as {
    endpoint?: unknown;
    keys?: { p256dh?: unknown; auth?: unknown };
  };
  if (
    typeof endpoint !== "string" ||
    !endpoint.startsWith("https://") ||
    endpoint.length > 1000 ||
    typeof keys?.p256dh !== "string" ||
    typeof keys?.auth !== "string" ||
    !BASE64URL.test(keys.p256dh) ||
    !BASE64URL.test(keys.auth) ||
    keys.p256dh.length > 200 ||
    keys.auth.length > 100
  ) {
    throw invalid();
  }
  try {
    new URL(endpoint);
  } catch {
    throw invalid();
  }
  return { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } };
}

/**
 * Stores this device for `userId`. If the same browser was registered by
 * someone else (a shared phone, another family member signed in), the
 * device now belongs to whoever turned notifications on last - otherwise
 * one person would receive another's notices.
 */
export async function saveSubscription(
  userId: string,
  subscription: PushSubscriptionInput,
  userAgent: string | null,
): Promise<void> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: userId,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      user_agent: userAgent ? userAgent.slice(0, 500) : null,
    },
    { onConflict: "endpoint" },
  );
  if (error) throw new Error(error.message);
}

export async function removeSubscription(
  userId: string,
  endpoint: string,
): Promise<void> {
  const supabase = createServiceRoleClient();
  await supabase
    .from("push_subscriptions")
    .delete()
    .eq("user_id", userId)
    .eq("endpoint", endpoint);
}

/**
 * The browser replaced a device's subscription. Only a subscription this
 * user already owns can be replaced, so a stranger's request can't take
 * over someone else's device. Returns false if there was nothing to replace.
 */
export async function replaceSubscription(
  userId: string,
  oldEndpoint: string | null,
  subscription: PushSubscriptionInput,
  userAgent: string | null,
): Promise<boolean> {
  const supabase = createServiceRoleClient();
  if (oldEndpoint) {
    const { data: owned } = await supabase
      .from("push_subscriptions")
      .select("id")
      .eq("user_id", userId)
      .eq("endpoint", oldEndpoint)
      .maybeSingle();
    if (!owned) return false;
    await supabase.from("push_subscriptions").delete().eq("id", owned.id);
  } else {
    // No old endpoint to prove ownership: accept only for a user who has
    // notifications on somewhere already.
    const { count } = await supabase
      .from("push_subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);
    if (!count) return false;
  }
  await saveSubscription(userId, subscription, userAgent);
  return true;
}

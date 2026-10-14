"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import {
  parseSubscription,
  removeSubscription,
  saveSubscription,
} from "@/lib/push/subscriptions";

/**
 * Notification actions for any signed-in user - teacher, parent or student.
 * Each one only ever touches the caller's own devices and inbox.
 */

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return { supabase, user };
}

/** Turns notifications on for this device (or refreshes its keys). */
export async function savePushSubscriptionAction(subscription: unknown) {
  const { user } = await requireUser();
  const parsed = parseSubscription(subscription);
  const userAgent = (await headers()).get("user-agent");
  await saveSubscription(user.id, parsed, userAgent);
}

/** Turns notifications off for this device. */
export async function removePushSubscriptionAction(endpoint: unknown) {
  const { user } = await requireUser();
  if (typeof endpoint !== "string" || endpoint.length > 1000) return;
  await removeSubscription(user.id, endpoint);
}

export type InboxItem = {
  id: string;
  title: string;
  body: string;
  url: string | null;
  created_at: string;
  read_at: string | null;
};

const INBOX_LIMIT = 30;

/** The caller's recent notices, newest first (RLS limits it to their own). */
export async function getInboxAction(): Promise<InboxItem[]> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("notification_inbox")
    .select("id, title, body, url, created_at, read_at")
    .order("created_at", { ascending: false })
    .limit(INBOX_LIMIT);
  if (error) throw new Error(error.message);
  return (data ?? []) as InboxItem[];
}

/** Marks some of the caller's notices (or all of them) as read. */
export async function markInboxReadAction(ids: string[] | "all") {
  const { supabase, user } = await requireUser();
  let query = supabase
    .from("notification_inbox")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("read_at", null);
  if (ids !== "all") {
    if (!Array.isArray(ids) || ids.length === 0) return;
    query = query.in("id", ids.filter((id) => typeof id === "string").slice(0, 100));
  }
  const { error } = await query;
  if (error) throw new Error(error.message);
}

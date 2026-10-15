import "server-only";
import * as Sentry from "@sentry/nextjs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  EVENTS,
  isTeacherAlert,
  renderMessage,
  type MessageValues,
  type NotificationEvent,
} from "@/lib/push/messages";
import { resolveRecipients, type RecipientSpec } from "@/lib/push/recipients";
import { loadNotificationSettings } from "@/lib/push/settings";
import { isInQuietHours, quietHoursEnd } from "@/lib/push/athens-time";
import { isPushConfigured, sendPush } from "@/lib/push/web-push";

const PARENT_URL = "/parent-dashboard";

export type NotifyOutcome =
  | "sent"
  | "held"
  | "no_devices"
  | "not_configured"
  | "no_recipients"
  | "switched_off"
  | "paused"
  | "class_muted"
  | "error";

export type NotifyResult = {
  outcome: NotifyOutcome;
  recipients: number;
  delivered: number;
  failed: number;
};

const skipped = (outcome: NotifyOutcome): NotifyResult => ({
  outcome,
  recipients: 0,
  delivered: 0,
  failed: 0,
});

export type Notice = {
  event: string;
  title: string;
  body: string;
  url: string;
  tag?: string;
};

/**
 * Sends one notice to the devices of the given users and records it in
 * notification_log. No settings checks - callers have done those.
 */
export async function pushToUsers(
  supabase: SupabaseClient,
  notice: Notice,
  userIds: string[],
  audience: string,
  triggeredBy: string | null = null,
): Promise<NotifyResult> {
  const log = async (fields: Record<string, unknown>) => {
    await supabase.from("notification_log").insert({
      event: notice.event,
      audience,
      title: notice.title,
      body: notice.body,
      url: notice.url,
      recipient_users: userIds.length,
      triggered_by: triggeredBy,
      ...fields,
    });
  };

  if (!isPushConfigured()) {
    await log({ outcome: "not_configured" });
    return { ...skipped("not_configured"), recipients: userIds.length };
  }

  const { data: subscriptions } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .in("user_id", userIds);

  if (!subscriptions || subscriptions.length === 0) {
    await log({ outcome: "no_devices" });
    return { ...skipped("no_devices"), recipients: userIds.length };
  }

  const results = await Promise.all(
    subscriptions.map((subscription) =>
      sendPush(subscription, {
        title: notice.title,
        body: notice.body,
        url: notice.url,
        tag: notice.tag ?? notice.event,
      }),
    ),
  );

  const delivered = subscriptions.filter((_, i) => results[i].ok);
  // The push service says these devices no longer exist - forget them.
  const gone = subscriptions.filter((_, i) => {
    const result = results[i];
    return !result.ok && result.gone;
  });
  if (gone.length > 0) {
    await supabase
      .from("push_subscriptions")
      .delete()
      .in("id", gone.map((s) => s.id));
  }
  if (delivered.length > 0) {
    await supabase
      .from("push_subscriptions")
      .update({ last_success_at: new Date().toISOString() })
      .in("id", delivered.map((s) => s.id));
  }

  const failed = subscriptions.length - delivered.length;
  await log({
    outcome: "sent",
    devices: subscriptions.length,
    delivered: delivered.length,
    failed,
  });
  return {
    outcome: "sent",
    recipients: userIds.length,
    delivered: delivered.length,
    failed,
  };
}

/**
 * Puts the notice in each user's in-portal list, then either pushes it now
 * or, during quiet hours, holds it for the morning run.
 */
export async function deliver(
  supabase: SupabaseClient,
  notice: Notice,
  userIds: string[],
  options: {
    audience: string;
    triggeredBy?: string | null;
    holdUntil?: Date | null;
    now?: Date;
  },
): Promise<NotifyResult> {
  if (userIds.length === 0) return skipped("no_recipients");

  await supabase.from("notification_inbox").insert(
    userIds.map((userId) => ({
      user_id: userId,
      event: notice.event,
      title: notice.title,
      body: notice.body,
      url: notice.url,
    })),
  );

  if (options.holdUntil) {
    await supabase.from("notification_queue").insert({
      event: notice.event,
      user_ids: userIds,
      title: notice.title,
      body: notice.body,
      url: notice.url,
      tag: notice.tag ?? null,
      send_after: options.holdUntil.toISOString(),
    });
    await supabase.from("notification_log").insert({
      event: notice.event,
      audience: options.audience,
      title: notice.title,
      body: notice.body,
      url: notice.url,
      recipient_users: userIds.length,
      outcome: "held",
      triggered_by: options.triggeredBy ?? null,
    });
    return { ...skipped("held"), recipients: userIds.length };
  }

  return pushToUsers(
    supabase,
    notice,
    userIds,
    options.audience,
    options.triggeredBy ?? null,
  );
}

export type NotifyInput = {
  event: NotificationEvent;
  to: RecipientSpec;
  values: MessageValues;
  /** Parents in `to` get this event's text instead (absences). */
  parentEvent?: NotificationEvent;
  /** The class the notice is about - checked against "mute per class". */
  classId?: string | null;
  /** Groups repeated notices on the phone (a newer one replaces the older). */
  tag?: string;
  /**
   * Opens this page instead of the event's default (e.g. the exact lesson
   * an attendance alert is about). Same-origin paths only; anything else
   * falls back to the default.
   */
  url?: string;
  triggeredBy?: string | null;
  supabase?: SupabaseClient;
  now?: Date;
};

/** A same-origin path ("/teacher-app/..."), or undefined for anything else. */
export function safeNoticeUrl(url: string | undefined): string | undefined {
  if (!url || !url.startsWith("/") || url.startsWith("//") || url.includes("\\")) {
    return undefined;
  }
  return url;
}

function combine(results: NotifyResult[]): NotifyResult {
  if (results.length === 0) return skipped("no_recipients");
  return {
    outcome: results.some((r) => r.outcome === "sent")
      ? "sent"
      : results[0].outcome,
    recipients: results.reduce((sum, r) => sum + r.recipients, 0),
    delivered: results.reduce((sum, r) => sum + r.delivered, 0),
    failed: results.reduce((sum, r) => sum + r.failed, 0),
  };
}

/**
 * The single entry point every hook uses. Checks the App tab settings,
 * finds the recipients, renders the (possibly edited) text and delivers it.
 *
 * Never throws: a notification problem must never undo or fail the
 * teacher's action that triggered it. Call it inside `after()`.
 */
export async function notify(input: NotifyInput): Promise<NotifyResult> {
  try {
    const supabase = input.supabase ?? createServiceRoleClient();
    const now = input.now ?? new Date();
    const settings = await loadNotificationSettings(supabase);
    const definition = EVENTS[input.event];
    const teacherAlert = isTeacherAlert(input.event);

    if (!teacherAlert && settings.paused) return skipped("paused");
    if (!settings[definition.switch]) return skipped("switched_off");

    if (!teacherAlert && input.classId) {
      const { data: classRow } = await supabase
        .from("classes")
        .select("notifications_muted")
        .eq("id", input.classId)
        .maybeSingle();
      if (classRow?.notifications_muted) return skipped("class_muted");
    }

    const recipients = await resolveRecipients(supabase, input.to, {
      parentFallback: settings.parent_fallback,
    });

    const events = [input.event, input.parentEvent].filter(
      (e): e is NotificationEvent => Boolean(e),
    );
    const { data: overrides } = await supabase
      .from("notification_templates")
      .select("event, title, body")
      .in("event", events);
    const overrideFor = (event: NotificationEvent) =>
      (overrides ?? []).find((row) => row.event === event) ?? null;

    const holdUntil =
      !teacherAlert &&
      settings.quiet_hours_enabled &&
      isInQuietHours(now, settings.quiet_start, settings.quiet_end)
        ? quietHoursEnd(now, settings.quiet_start, settings.quiet_end)
        : null;

    const notice = (event: NotificationEvent, url?: string): Notice => {
      const message = renderMessage(event, input.values, overrideFor(event));
      return {
        event,
        title: message.title,
        body: message.body,
        url: url ?? message.url,
        tag: input.tag,
      };
    };

    const common = {
      triggeredBy: input.triggeredBy ?? null,
      holdUntil,
      now,
    };
    const results: NotifyResult[] = [];
    const urlOverride = safeNoticeUrl(input.url);

    if (recipients.students.length > 0) {
      results.push(
        await deliver(supabase, notice(input.event, urlOverride), recipients.students, {
          ...common,
          audience: "students",
        }),
      );
    }
    if (recipients.parents.length > 0) {
      // Parents reached through parent fallback see the student's text,
      // but tapping it opens their own portal.
      const parentNotice = input.parentEvent
        ? notice(input.parentEvent)
        : notice(input.event, definition.group === "school" ? PARENT_URL : undefined);
      results.push(
        await deliver(supabase, parentNotice, recipients.parents, {
          ...common,
          audience: "parents",
        }),
      );
    }
    if (recipients.teachers.length > 0) {
      results.push(
        await deliver(supabase, notice(input.event, urlOverride), recipients.teachers, {
          ...common,
          holdUntil: null,
          audience: "teacher",
        }),
      );
    }

    return combine(results);
  } catch (error: unknown) {
    Sentry.captureException(error, { tags: { feature: "push-notifications" } });
    return skipped("error");
  }
}

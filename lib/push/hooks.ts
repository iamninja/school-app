import "server-only";
import { after } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { notify, type NotifyInput } from "@/lib/push/notify";

/**
 * Runs notification work after the response has been sent, so a teacher's
 * save is never slowed down - or failed - by sending notifications.
 *
 * Outside a request (unit tests of unrelated behaviour, scripts) `after()`
 * throws; there is nothing to notify in that case, so it's skipped.
 */
export function runAfterResponse(task: () => Promise<unknown>): void {
  try {
    after(async () => {
      try {
        await task();
      } catch {
        // notify() reports its own errors; this only guards the lookups a
        // task does before calling it.
      }
    });
  } catch {
    // Not inside a request - nothing to do.
  }
}

/** Sends one notice after the response. */
export function notifyAfterResponse(input: NotifyInput): void {
  runAfterResponse(() => notify(input));
}

/**
 * Sends a school notice to each of several classes (e.g. a quiz assigned to
 * two classes), filling {class} with each class's own name.
 */
export function notifyClassesAfterResponse(
  classIds: string[],
  input: Omit<NotifyInput, "to" | "classId">,
): void {
  if (classIds.length === 0) return;
  runAfterResponse(async () => {
    const supabase = createServiceRoleClient();
    const { data: classes } = await supabase
      .from("classes")
      .select("id, name")
      .in("id", classIds);
    for (const classRow of classes ?? []) {
      await notify({
        ...input,
        to: { kind: "class_students", classId: classRow.id },
        classId: classRow.id,
        values: { ...input.values, class: classRow.name },
        supabase,
      });
    }
  });
}

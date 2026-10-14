"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { CloudOff } from "lucide-react";
import { toast } from "sonner";

import { setAttendanceAction } from "@/app/protected/teacher/actions";
import { TOAST_TOP } from "@/components/teacher-app/format";
import { getErrorMessage } from "@/lib/expected-error";
import {
  flushQueue,
  getQueueSnapshot,
  getServerQueueSnapshot,
  subscribeToQueue,
} from "@/lib/teacher-app/attendance-queue";

const RETRY_MS = 30_000;

/**
 * Sends attendance marks that were tapped without signal: when the
 * companion opens, when the phone comes back online or the app back to the
 * front, and every 30 s meanwhile. Shows a slim banner while any are
 * waiting. Lives in the companion shell, so it runs on every screen.
 */
export function AttendanceSync() {
  const router = useRouter();
  const queue = useSyncExternalStore(subscribeToQueue, getQueueSnapshot, getServerQueueSnapshot);

  useEffect(() => {
    const run = async () => {
      if (getQueueSnapshot().length === 0 || navigator.onLine === false) return;
      const result = await flushQueue(setAttendanceAction);
      for (const { mark, error } of result.rejected) {
        toast.error(
          `Couldn't save ${mark.studentName}'s attendance: ${getErrorMessage(error, "the server refused it")}`,
          TOAST_TOP,
        );
      }
      if (result.sent > 0) {
        toast.success(
          result.sent === 1 ? "1 attendance mark sent" : `${result.sent} attendance marks sent`,
          TOAST_TOP,
        );
        // Re-read the screen so charges and counts reflect what was saved.
        router.refresh();
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void run();
    };

    void run();
    window.addEventListener("online", run);
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(run, RETRY_MS);
    return () => {
      window.removeEventListener("online", run);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
    };
  }, [router]);

  if (queue.length === 0) return null;

  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 border-b border-amber-500/30 bg-amber-400/15 px-4 py-2 text-xs font-medium text-amber-900 dark:text-amber-200"
    >
      <CloudOff className="size-3.5" aria-hidden="true" />
      {queue.length === 1
        ? "1 attendance mark waiting for signal"
        : `${queue.length} attendance marks waiting for signal`}{" "}
      - sent automatically
    </div>
  );
}

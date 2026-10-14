"use client";

import { BellRing } from "lucide-react";

import { Button } from "@/components/ui/button";
import { usePushDevice } from "@/components/use-push-device";

/**
 * A quiet prompt under the day's lessons: turn on notifications on this phone
 * so teacher alerts (quizzes to review, failed charge runs or myDATA
 * submissions) reach it. Same device logic as the App tab's "This device"
 * card; says nothing once notifications are on, or where they can't work.
 */
export function DeviceNotifications() {
  const { state, busy, error, enable } = usePushDevice();

  if (state === "off") {
    return (
      <div className="space-y-2 rounded-lg border border-border bg-card p-3">
        <div className="flex items-center gap-3">
          <BellRing className="size-5 shrink-0 text-brand" aria-hidden="true" />
          <p className="flex-1 text-sm">Get teacher alerts on this phone.</p>
          <Button type="button" className="h-10" disabled={busy} onClick={() => void enable()}>
            Turn on
          </Button>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    );
  }

  if (state === "needs-install") {
    return (
      <p className="text-center text-xs text-muted-foreground">
        For alerts on iPhone, add Modus to the home screen and open it from there.
      </p>
    );
  }

  if (state === "blocked") {
    return (
      <p className="text-center text-xs text-muted-foreground">
        Notifications are blocked for Modus in this phone&apos;s settings.
      </p>
    );
  }

  return null;
}

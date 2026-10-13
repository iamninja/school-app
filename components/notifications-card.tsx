"use client";

import { Bell, BellOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { usePushDevice } from "@/components/use-push-device";

/**
 * Lets a parent or student turn notifications on or off for the device
 * they're holding. One switch per device - which notices exist is the
 * teacher's choice (App tab). Hidden where it can't work (dev server,
 * notifications not configured, very old browsers) and in the demo.
 */
export function NotificationsCard({ demoMode = false }: { demoMode?: boolean }) {
  const { state, busy, error, enable, disable } = usePushDevice();

  if (
    demoMode ||
    state === "loading" ||
    state === "unavailable" ||
    state === "unsupported"
  ) {
    return null;
  }

  return (
    <section
      aria-labelledby="notifications-card-title"
      className="rounded-2xl border border-border/80 bg-card p-5 shadow-xs"
    >
      <div className="flex items-start gap-3">
        {state === "on" ? (
          <Bell className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden="true" />
        ) : (
          <BellOff className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        )}
        <div className="flex-1 space-y-2">
          <h2 id="notifications-card-title" className="text-base font-semibold">
            Ειδοποιήσεις
          </h2>

          {state === "needs-install" && (
            <p className="text-sm text-muted-foreground">
              Στο iPhone οι ειδοποιήσεις λειτουργούν μόνο μέσα από την
              εγκατεστημένη εφαρμογή. Εγκαταστήστε πρώτα την εφαρμογή Modus
              και ανοίξτε την από την αρχική οθόνη.
            </p>
          )}

          {state === "off" && (
            <>
              <p className="text-sm text-muted-foreground">
                Μάθετε αμέσως για νέες εργασίες, αλλαγές μαθημάτων, βαθμούς
                και αποδείξεις.
              </p>
              <Button type="button" size="sm" onClick={() => void enable()} disabled={busy}>
                Ενεργοποίηση ειδοποιήσεων
              </Button>
            </>
          )}

          {state === "on" && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm">Ενεργές σε αυτή τη συσκευή.</p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void disable()}
                disabled={busy}
              >
                Απενεργοποίηση
              </Button>
            </div>
          )}

          {state === "blocked" && (
            <p className="text-sm text-muted-foreground">
              Οι ειδοποιήσεις είναι αποκλεισμένες για το Modus. Για να τις
              ενεργοποιήσετε, ανοίξτε τις ρυθμίσεις του κινητού (ή του
              προγράμματος περιήγησης), βρείτε το Modus και επιτρέψτε τις
              ειδοποιήσεις. Μετά ανανεώστε αυτή τη σελίδα.
            </p>
          )}

          {error && (
            <p role="alert" className="text-sm text-red-700 dark:text-red-400">
              {error}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

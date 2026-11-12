"use client";

import * as React from "react";

import { athensToday } from "@/lib/push/athens-time";

/** Read by public/offline.html - keep the key and shape in step with it. */
export const CHRISTMAS_STORAGE_KEY = "modus-christmas";

/**
 * Remembers today's Christmas look in this browser, for the installed
 * app's offline page (public/offline.html): offline it can't ask the
 * server, so it shows what the app last showed online - and only if that
 * was within the last few days.
 */
export function RememberChristmas({ hat, snow }: { hat: boolean; snow: boolean }) {
  React.useEffect(() => {
    try {
      if (hat || snow) {
        localStorage.setItem(CHRISTMAS_STORAGE_KEY, JSON.stringify({ hat, snow, day: athensToday() }));
      } else {
        localStorage.removeItem(CHRISTMAS_STORAGE_KEY);
      }
    } catch {
      // Storage blocked (private mode) - the offline page just stays plain.
    }
  }, [hat, snow]);
  return null;
}

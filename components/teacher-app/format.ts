import { fromIsoDate } from "@/lib/calendar-projection";

const LONG = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
});

/** "Wed 14 Oct" - the companion's date label. */
export function formatCompanionDate(date: string): string {
  return LONG.format(fromIsoDate(date));
}

/** The companion's toasts go to the top, clear of the bottom tab bar. */
export const TOAST_TOP = { position: "top-center" } as const;

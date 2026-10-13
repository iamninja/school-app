import { addDaysToDate } from "@/lib/push/athens-time";

/**
 * Orthodox Easter Sunday for a year, as 'YYYY-MM-DD' (Gregorian calendar).
 * Meeus' Julian-calendar algorithm, then +13 days to convert - valid for
 * 1900-2099, which covers this app's lifetime comfortably.
 */
export function orthodoxEaster(year: number): string {
  const a = year % 4;
  const b = year % 7;
  const c = year % 19;
  const d = (19 * c + 15) % 30;
  const e = (2 * a + 4 * b - d + 34) % 7;
  const month = Math.floor((d + e + 114) / 31);
  const day = ((d + e + 114) % 31) + 1;
  const julian = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return addDaysToDate(julian, 13);
}

export type AnnouncementSchedule = {
  recurrence: "once" | "yearly_date" | "yearly_orthodox_easter";
  send_on: string | null;
  enabled: boolean;
  last_sent_on: string | null;
};

/** The date this announcement is next sent on (today counts), or null. */
export function nextSendDate(
  announcement: AnnouncementSchedule,
  today: string,
): string | null {
  if (!announcement.enabled) return null;
  const year = Number(today.slice(0, 4));
  const notSentOn = (date: string) => announcement.last_sent_on !== date;

  switch (announcement.recurrence) {
    case "once": {
      const date = announcement.send_on;
      return date && date >= today && notSentOn(date) ? date : null;
    }
    case "yearly_date": {
      if (!announcement.send_on) return null;
      const monthDay = announcement.send_on.slice(5);
      const thisYear = `${year}-${monthDay}`;
      return thisYear >= today && notSentOn(thisYear)
        ? thisYear
        : `${year + 1}-${monthDay}`;
    }
    case "yearly_orthodox_easter": {
      const thisYear = orthodoxEaster(year);
      return thisYear >= today && notSentOn(thisYear)
        ? thisYear
        : orthodoxEaster(year + 1);
    }
  }
}

/** Whether the announcement should go out today. */
export function isDueToday(announcement: AnnouncementSchedule, today: string): boolean {
  return nextSendDate(announcement, today) === today;
}

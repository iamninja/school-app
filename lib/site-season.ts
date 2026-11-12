// The public front page's Christmas look (supabase/migrations/*_site-settings.sql):
// whether it shows today, and which parts. Pure - the page, the console's
// App tab and the tests share it.

export type ChristmasMode = "auto" | "on" | "off";

/** A day of the year, "MM-DD". */
export type DayOfYear = string;

export interface SiteSettings {
  christmas_mode: ChristmasMode;
  christmas_snow: boolean;
  christmas_hat: boolean;
  christmas_banner: boolean;
  /** The snow and hat also in the student and parent apps. */
  christmas_portals: boolean;
  /** Null or empty: DEFAULT_CHRISTMAS_MESSAGE. */
  christmas_message: string | null;
  /** Snow and the Santa hat show from this day... */
  christmas_decorations_from: DayOfYear;
  /** ...the message from this one... */
  christmas_message_from: DayOfYear;
  /** ...and both until this one, inclusive. */
  christmas_until: DayOfYear;
}

export const SITE_SETTINGS_COLUMNS =
  "christmas_mode, christmas_snow, christmas_hat, christmas_banner, christmas_portals, christmas_message, " +
  "christmas_decorations_from, christmas_message_from, christmas_until";

/** Before the migration is applied, or if the row can't be read. */
export const DEFAULT_SITE_SETTINGS: SiteSettings = {
  christmas_mode: "auto",
  christmas_snow: true,
  christmas_hat: true,
  christmas_banner: true,
  christmas_portals: true,
  christmas_message: null,
  christmas_decorations_from: "11-11",
  christmas_message_from: "12-24",
  christmas_until: "01-07",
};

export const DEFAULT_CHRISTMAS_MESSAGE = "Καλές γιορτές! Διακοπές Χριστουγέννων 24/12 – 7/1";

export const CHRISTMAS_MESSAGE_MAX_LENGTH = 160;

const DAY_OF_YEAR = /^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/;

export function isDayOfYear(value: string): boolean {
  return DAY_OF_YEAR.test(value);
}

/** "24/12" for "12-24". */
export function formatDayOfYear(day: DayOfYear): string {
  const [month, date] = day.split("-").map(Number);
  return `${date}/${month}`;
}

/** "24/12" or "24/12/2026" -> "12-24"; null when it isn't a day. */
export function parseDayOfYear(text: string): DayOfYear | null {
  const match = /^\s*(\d{1,2})\s*[/.-]\s*(\d{1,2})\s*$/.exec(text);
  if (!match) return null;
  const value = `${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  return isDayOfYear(value) ? value : null;
}

/**
 * Is `today` (YYYY-MM-DD) within from..until, inclusive? A window whose
 * start is after its end runs over New Year (24/12 - 7/1).
 */
export function inYearWindow(today: string, from: DayOfYear, until: DayOfYear): boolean {
  const day = today.slice(5);
  return from <= until ? day >= from && day <= until : day >= from || day <= until;
}

export interface ChristmasLook {
  snow: boolean;
  hat: boolean;
  /** The message to show, or null for none. */
  message: string | null;
}

/** What the front page shows today - null when nothing Christmas is on. */
export function christmasLook(settings: SiteSettings, today: string): ChristmasLook | null {
  if (settings.christmas_mode === "off") return null;
  const now = settings.christmas_mode === "on";
  const decorations =
    now || inYearWindow(today, settings.christmas_decorations_from, settings.christmas_until);
  const messageDays =
    now || inYearWindow(today, settings.christmas_message_from, settings.christmas_until);
  const look = {
    snow: decorations && settings.christmas_snow,
    hat: decorations && settings.christmas_hat,
    message:
      messageDays && settings.christmas_banner
        ? settings.christmas_message?.trim() || DEFAULT_CHRISTMAS_MESSAGE
        : null,
  };
  return look.snow || look.hat || look.message ? look : null;
}

/**
 * The student and parent apps: the same snow and hat on the same days, when
 * the teacher wants them there too - never the message (it's for visitors).
 */
export function portalChristmasLook(settings: SiteSettings, today: string): ChristmasLook | null {
  if (!settings.christmas_portals) return null;
  const look = christmasLook(settings, today);
  if (!look || (!look.snow && !look.hat)) return null;
  return { ...look, message: null };
}

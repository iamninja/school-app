// The public front page's Christmas look (supabase/migrations/*_site-settings.sql):
// whether it shows today, and which parts. Pure - the page, the console's
// App tab and the tests share it.

export type ChristmasMode = "auto" | "on" | "off";

export interface SiteSettings {
  christmas_mode: ChristmasMode;
  christmas_snow: boolean;
  christmas_hat: boolean;
  christmas_banner: boolean;
  /** Null or empty: DEFAULT_CHRISTMAS_MESSAGE. */
  christmas_message: string | null;
}

export const SITE_SETTINGS_COLUMNS =
  "christmas_mode, christmas_snow, christmas_hat, christmas_banner, christmas_message";

/** Before the migration is applied, or if the row can't be read. */
export const DEFAULT_SITE_SETTINGS: SiteSettings = {
  christmas_mode: "auto",
  christmas_snow: true,
  christmas_hat: true,
  christmas_banner: true,
  christmas_message: null,
};

export const DEFAULT_CHRISTMAS_MESSAGE = "Καλές γιορτές! Διακοπές Χριστουγέννων 24/12 – 7/1";

export const CHRISTMAS_MESSAGE_MAX_LENGTH = 160;

/** 1 December to 7 January, inclusive - `today` as YYYY-MM-DD (Athens). */
export function isChristmasSeason(today: string): boolean {
  const monthDay = today.slice(5);
  return monthDay >= "12-01" || monthDay <= "01-07";
}

export interface ChristmasLook {
  snow: boolean;
  hat: boolean;
  /** The message to show, or null for none. */
  message: string | null;
}

/** What the front page shows today - null when it isn't Christmas there. */
export function christmasLook(settings: SiteSettings, today: string): ChristmasLook | null {
  const showing =
    settings.christmas_mode === "on" ||
    (settings.christmas_mode === "auto" && isChristmasSeason(today));
  if (!showing) return null;
  const look = {
    snow: settings.christmas_snow,
    hat: settings.christmas_hat,
    message: settings.christmas_banner
      ? settings.christmas_message?.trim() || DEFAULT_CHRISTMAS_MESSAGE
      : null,
  };
  return look.snow || look.hat || look.message ? look : null;
}

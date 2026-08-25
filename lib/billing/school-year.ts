/**
 * Which calendar months tuition accrues for, and the "next N billable
 * periods" arithmetic used by the Prepay UI preview. Pure, no DB - mirrors
 * public.is_billable_month() in supabase/migrations/..._school-year-window.sql
 * exactly (same three-line modular-arithmetic rule); a parity test in
 * tests/rls/family-balance.test.ts sweeps both implementations over every
 * (month, start, duration) combination so having the rule in two places
 * is defensible.
 */

export const DEFAULT_SCHOOL_YEAR_START_MONTH = 9;
export const DEFAULT_SCHOOL_YEAR_DURATION_MONTHS = 9;

// The business is Greek - "October's charge" means the Greek October, not
// the UTC one. This matters at the boundary: Vercel's serverless runtime
// is UTC, and 31 Aug 23:30 UTC is already 1 Sep in Athens.
export const BILLING_TIME_ZONE = "Europe/Athens";

export interface SchoolYearWindow {
  startMonth: number; // 1-12
  durationMonths: number; // 1-12
}

/** month is 1-12. Matches is_billable_month() in Postgres exactly. */
export function isBillableMonth(
  month: number,
  window: SchoolYearWindow,
): boolean {
  return (
    ((month - window.startMonth + 12) % 12) < window.durationMonths
  );
}

export function billableMonths(window: SchoolYearWindow): number[] {
  const months: number[] = [];
  for (let month = 1; month <= 12; month++) {
    if (isBillableMonth(month, window)) months.push(month);
  }
  return months;
}

/**
 * "2026-10-01" - the first-of-month period string for `now`, resolved in
 * BILLING_TIME_ZONE rather than the server's local/UTC time. Uses the
 * en-CA Intl formatting trick (yields yyyy-MM-dd directly) rather than
 * pulling in date-fns-tz for one conversion.
 */
export function currentPeriod(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BILLING_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
  }).format(now);
  return `${parts}-01`;
}

/** "2026-10-01" + 3 -> "2027-01-01". Pure calendar-month arithmetic. */
export function addMonthsToPeriod(period: string, months: number): string {
  const [year, month] = period.split("-").map(Number);
  const total = (year * 12 + (month - 1)) + months;
  const nextYear = Math.floor(total / 12);
  const nextMonth = (total % 12) + 1;
  return `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;
}

function periodMonth(period: string): number {
  return Number(period.split("-")[1]);
}

/**
 * The next `count` BILLABLE periods strictly after `afterPeriod` (or from
 * it too, if inclusive). This is what makes "prepay 3 months" in May
 * correctly name Sept/Oct/Nov rather than May/Jun/Jul - a calendar-month
 * count would create a credit for months that never generate a charge.
 */
export function nextBillablePeriods(
  afterPeriod: string,
  count: number,
  window: SchoolYearWindow,
  inclusive = false,
): string[] {
  const periods: string[] = [];
  let cursor = afterPeriod;
  let first = true;
  while (periods.length < count) {
    if (!(first && inclusive)) {
      cursor = addMonthsToPeriod(cursor, 1);
    }
    first = false;
    if (isBillableMonth(periodMonth(cursor), window)) {
      periods.push(cursor);
    }
  }
  return periods;
}

const MONTH_LABELS_EL = [
  "Ιαν",
  "Φεβ",
  "Μαρ",
  "Απρ",
  "Μάι",
  "Ιουν",
  "Ιουλ",
  "Αυγ",
  "Σεπ",
  "Οκτ",
  "Νοε",
  "Δεκ",
];

/** "2026-10-01" -> "Οκτ 2026" (el) or "Oct 2026" (en). */
export function formatPeriodLabel(
  period: string,
  locale: "el" | "en" = "el",
): string {
  const [year, month] = period.split("-").map(Number);
  if (locale === "en") {
    return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-US", {
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
  }
  return `${MONTH_LABELS_EL[month - 1]} ${year}`;
}

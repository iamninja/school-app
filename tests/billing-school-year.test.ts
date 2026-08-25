import { describe, expect, it } from "vitest";
import {
  addMonthsToPeriod,
  currentPeriod,
  formatPeriodLabel,
  isBillableMonth,
  nextBillablePeriods,
} from "@/lib/billing/school-year";

describe("isBillableMonth", () => {
  const schoolYear = { startMonth: 9, durationMonths: 9 };

  it("is true for September through May under the default 9-month window", () => {
    for (const month of [9, 10, 11, 12, 1, 2, 3, 4, 5]) {
      expect(isBillableMonth(month, schoolYear)).toBe(true);
    }
  });

  it("is false for June, July, August - the summer skip is the whole point", () => {
    expect(isBillableMonth(6, schoolYear)).toBe(false);
    expect(isBillableMonth(7, schoolYear)).toBe(false);
    expect(isBillableMonth(8, schoolYear)).toBe(false);
  });

  it("treats duration 12 as every month billable", () => {
    const allYear = { startMonth: 9, durationMonths: 12 };
    for (let month = 1; month <= 12; month++) {
      expect(isBillableMonth(month, allYear)).toBe(true);
    }
  });

  it("treats duration 1 as only the start month billable", () => {
    const oneMonth = { startMonth: 9, durationMonths: 1 };
    expect(isBillableMonth(9, oneMonth)).toBe(true);
    expect(isBillableMonth(8, oneMonth)).toBe(false);
    expect(isBillableMonth(10, oneMonth)).toBe(false);
  });

  it("doesn't hardcode September - a January start works identically", () => {
    const janStart = { startMonth: 1, durationMonths: 6 };
    for (const month of [1, 2, 3, 4, 5, 6]) {
      expect(isBillableMonth(month, janStart)).toBe(true);
    }
    for (const month of [7, 8, 9, 10, 11, 12]) {
      expect(isBillableMonth(month, janStart)).toBe(false);
    }
  });
});

describe("addMonthsToPeriod", () => {
  it("adds months within a year", () => {
    expect(addMonthsToPeriod("2026-09-01", 2)).toBe("2026-11-01");
  });

  it("rolls over into the next year", () => {
    expect(addMonthsToPeriod("2026-11-01", 3)).toBe("2027-02-01");
  });
});

describe("nextBillablePeriods", () => {
  const schoolYear = { startMonth: 9, durationMonths: 9 };

  it("skips summer entirely - prepaying 3 months in May means Sep/Oct/Nov, not May/Jun/Jul", () => {
    expect(nextBillablePeriods("2026-05-01", 3, schoolYear)).toEqual([
      "2026-09-01",
      "2026-10-01",
      "2026-11-01",
    ]);
  });

  it("handles a year rollover", () => {
    expect(nextBillablePeriods("2026-11-01", 4, schoolYear)).toEqual([
      "2026-12-01",
      "2027-01-01",
      "2027-02-01",
      "2027-03-01",
    ]);
  });

  it("is exclusive of the starting period by default", () => {
    const result = nextBillablePeriods("2026-09-01", 1, schoolYear);
    expect(result).toEqual(["2026-10-01"]);
  });

  it("includes the starting period when inclusive", () => {
    const result = nextBillablePeriods("2026-09-01", 1, schoolYear, true);
    expect(result).toEqual(["2026-09-01"]);
  });
});

describe("currentPeriod", () => {
  it("resolves the period in Athens time, not UTC - late August UTC is already September in Athens", () => {
    // 2026-08-31T23:30:00Z is 2026-09-01 02:30 in Athens (UTC+3, EEST).
    const lateAugustUtc = new Date("2026-08-31T23:30:00Z");
    expect(currentPeriod(lateAugustUtc)).toBe("2026-09-01");
  });

  it("stays in the same month for a clearly-mid-month UTC time", () => {
    const midOctober = new Date("2026-10-15T12:00:00Z");
    expect(currentPeriod(midOctober)).toBe("2026-10-01");
  });
});

describe("formatPeriodLabel", () => {
  it("formats in Greek by default", () => {
    expect(formatPeriodLabel("2026-11-01")).toBe("Νοε 2026");
  });

  it("formats in English when asked", () => {
    expect(formatPeriodLabel("2026-11-01", "en")).toBe("Nov 2026");
  });
});

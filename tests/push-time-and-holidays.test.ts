import { describe, expect, it } from "vitest";
import {
  addDaysToDate,
  athensDateTimeToUtc,
  athensToday,
  formatShortDateEl,
  isInQuietHours,
  quietHoursEnd,
} from "@/lib/push/athens-time";
import { isDueToday, nextSendDate, orthodoxEaster } from "@/lib/push/greek-holidays";

describe("Athens wall-clock helpers", () => {
  it("knows the Athens date when UTC is still on the previous day", () => {
    // 22:30 UTC on 13 Oct = 01:30 on 14 Oct in Athens (UTC+3, summer time).
    expect(athensToday(new Date("2026-10-13T22:30:00Z"))).toBe("2026-10-14");
  });

  it("converts Athens wall-clock time to UTC across summer and winter time", () => {
    expect(athensDateTimeToUtc("2026-07-01", "20:00").toISOString()).toBe(
      "2026-07-01T17:00:00.000Z",
    );
    expect(athensDateTimeToUtc("2026-12-01", "20:00").toISOString()).toBe(
      "2026-12-01T18:00:00.000Z",
    );
  });

  it("handles quiet hours that cross midnight", () => {
    const at = (iso: string) => new Date(iso);
    // Winter (UTC+2): 23:00 Athens = 21:00 UTC.
    expect(isInQuietHours(at("2026-12-01T21:00:00Z"), "22:00", "08:00")).toBe(true);
    expect(isInQuietHours(at("2026-12-01T05:00:00Z"), "22:00", "08:00")).toBe(true);
    expect(isInQuietHours(at("2026-12-01T10:00:00Z"), "22:00", "08:00")).toBe(false);
    expect(quietHoursEnd(at("2026-12-01T21:00:00Z"), "22:00", "08:00").toISOString()).toBe(
      "2026-12-02T06:00:00.000Z",
    );
    expect(quietHoursEnd(at("2026-12-01T05:00:00Z"), "22:00", "08:00").toISOString()).toBe(
      "2026-12-01T06:00:00.000Z",
    );
  });

  it("formats dates the way a lock screen reads them", () => {
    expect(formatShortDateEl("2026-03-05")).toBe("5/3");
    expect(addDaysToDate("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("orthodoxEaster", () => {
  it.each([
    [2025, "2025-04-20"],
    [2026, "2026-04-12"],
    [2027, "2027-05-02"],
    [2028, "2028-04-16"],
  ])("%i -> %s", (year, expected) => {
    expect(orthodoxEaster(year)).toBe(expected);
  });
});

describe("scheduled announcement dates", () => {
  const base = { enabled: true, last_sent_on: null };

  it("sends a one-off once, on its date", () => {
    const once = { ...base, recurrence: "once" as const, send_on: "2026-12-24" };
    expect(isDueToday(once, "2026-12-24")).toBe(true);
    expect(isDueToday({ ...once, last_sent_on: "2026-12-24" }, "2026-12-24")).toBe(false);
    expect(nextSendDate(once, "2026-12-25")).toBeNull();
  });

  it("repeats a yearly date every year, but only once a day", () => {
    const christmas = { ...base, recurrence: "yearly_date" as const, send_on: "2026-12-25" };
    expect(isDueToday(christmas, "2027-12-25")).toBe(true);
    expect(nextSendDate(christmas, "2027-12-26")).toBe("2028-12-25");
    expect(
      isDueToday({ ...christmas, last_sent_on: "2027-12-25" }, "2027-12-25"),
    ).toBe(false);
  });

  it("follows Orthodox Easter as it moves", () => {
    const easter = { ...base, recurrence: "yearly_orthodox_easter" as const, send_on: null };
    expect(nextSendDate(easter, "2026-10-13")).toBe("2027-05-02");
    expect(isDueToday(easter, "2026-04-12")).toBe(true);
  });

  it("never sends a disabled one", () => {
    const off = { ...base, enabled: false, recurrence: "yearly_date" as const, send_on: "2026-12-25" };
    expect(nextSendDate(off, "2026-12-25")).toBeNull();
  });
});

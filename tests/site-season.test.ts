import { describe, expect, it } from "vitest";

import {
  DEFAULT_CHRISTMAS_MESSAGE,
  DEFAULT_SITE_SETTINGS,
  christmasLook,
  formatDayOfYear,
  portalChristmasLook,
  inYearWindow,
  parseDayOfYear,
} from "@/lib/site-season";

describe("inYearWindow", () => {
  it.each([
    ["2026-11-10", false],
    ["2026-11-11", true],
    ["2026-12-31", true],
    ["2027-01-01", true],
    ["2027-01-07", true],
    ["2027-01-08", false],
    ["2027-06-15", false],
  ])("11/11 - 7/1 over New Year: %s -> %s", (date, expected) => {
    expect(inYearWindow(date, "11-11", "01-07")).toBe(expected);
  });

  it("handles a window inside one year", () => {
    expect(inYearWindow("2027-04-10", "04-01", "04-20")).toBe(true);
    expect(inYearWindow("2027-04-21", "04-01", "04-20")).toBe(false);
  });
});

describe("day of year", () => {
  it("reads 24/12 style dates and writes them back", () => {
    expect(parseDayOfYear("24/12")).toBe("12-24");
    expect(parseDayOfYear(" 7/1 ")).toBe("01-07");
    expect(parseDayOfYear("1.12")).toBe("12-01");
    expect(parseDayOfYear("32/12")).toBeNull();
    expect(parseDayOfYear("12/13")).toBeNull();
    expect(parseDayOfYear("soon")).toBeNull();
    expect(formatDayOfYear("01-07")).toBe("7/1");
  });
});

describe("christmasLook", () => {
  it("shows the decorations from 11/11 but the message only from 24/12", () => {
    expect(christmasLook(DEFAULT_SITE_SETTINGS, "2026-11-20")).toEqual({ snow: true, hat: true, message: null });
    expect(christmasLook(DEFAULT_SITE_SETTINGS, "2026-12-24")).toEqual({
      snow: true,
      hat: true,
      message: DEFAULT_CHRISTMAS_MESSAGE,
    });
    expect(christmasLook(DEFAULT_SITE_SETTINGS, "2027-01-07")?.message).toBe(DEFAULT_CHRISTMAS_MESSAGE);
  });

  it("shows nothing outside the dates on auto, and everything on 'on'", () => {
    expect(christmasLook(DEFAULT_SITE_SETTINGS, "2026-10-01")).toBeNull();
    expect(christmasLook({ ...DEFAULT_SITE_SETTINGS, christmas_mode: "on" }, "2026-10-01")).toEqual({
      snow: true,
      hat: true,
      message: DEFAULT_CHRISTMAS_MESSAGE,
    });
  });

  it("shows nothing when off, even on Christmas Day", () => {
    expect(christmasLook({ ...DEFAULT_SITE_SETTINGS, christmas_mode: "off" }, "2026-12-25")).toBeNull();
  });

  it("follows the teacher's own dates", () => {
    const settings = { ...DEFAULT_SITE_SETTINGS, christmas_decorations_from: "12-01", christmas_message_from: "12-20" };
    expect(christmasLook(settings, "2026-11-20")).toBeNull();
    expect(christmasLook(settings, "2026-12-20")?.message).toBe(DEFAULT_CHRISTMAS_MESSAGE);
  });

  it("uses the teacher's own message, and drops the parts switched off", () => {
    expect(
      christmasLook(
        { ...DEFAULT_SITE_SETTINGS, christmas_snow: false, christmas_message: "  Χρόνια πολλά!  " },
        "2026-12-28",
      ),
    ).toEqual({ snow: false, hat: true, message: "Χρόνια πολλά!" });
    expect(
      christmasLook({ ...DEFAULT_SITE_SETTINGS, christmas_banner: false }, "2026-12-28")?.message,
    ).toBeNull();
  });

  it("is null when every part is switched off", () => {
    expect(
      christmasLook(
        { ...DEFAULT_SITE_SETTINGS, christmas_snow: false, christmas_hat: false, christmas_banner: false },
        "2026-12-28",
      ),
    ).toBeNull();
  });
});

describe("portalChristmasLook", () => {
  it("shows the snow and hat in the apps, but never the message", () => {
    expect(portalChristmasLook(DEFAULT_SITE_SETTINGS, "2026-12-28")).toEqual({ snow: true, hat: true, message: null });
  });

  it("is off when the apps are switched off, or nothing but the message is on", () => {
    expect(portalChristmasLook({ ...DEFAULT_SITE_SETTINGS, christmas_portals: false }, "2026-12-28")).toBeNull();
    expect(
      portalChristmasLook({ ...DEFAULT_SITE_SETTINGS, christmas_snow: false, christmas_hat: false }, "2026-12-28"),
    ).toBeNull();
    expect(portalChristmasLook(DEFAULT_SITE_SETTINGS, "2026-10-01")).toBeNull();
  });
});

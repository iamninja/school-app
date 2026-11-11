import { describe, expect, it } from "vitest";

import {
  DEFAULT_CHRISTMAS_MESSAGE,
  DEFAULT_SITE_SETTINGS,
  christmasLook,
  isChristmasSeason,
} from "@/lib/site-season";

describe("isChristmasSeason", () => {
  it.each([
    ["2026-11-30", false],
    ["2026-12-01", true],
    ["2026-12-25", true],
    ["2026-12-31", true],
    ["2027-01-01", true],
    ["2027-01-07", true],
    ["2027-01-08", false],
    ["2027-06-15", false],
  ])("%s -> %s", (date, expected) => {
    expect(isChristmasSeason(date)).toBe(expected);
  });
});

describe("christmasLook", () => {
  it("shows everything, with the default message, in season on auto", () => {
    expect(christmasLook(DEFAULT_SITE_SETTINGS, "2026-12-10")).toEqual({
      snow: true,
      hat: true,
      message: DEFAULT_CHRISTMAS_MESSAGE,
    });
  });

  it("shows nothing out of season on auto, and anything on 'on'", () => {
    expect(christmasLook(DEFAULT_SITE_SETTINGS, "2026-11-11")).toBeNull();
    expect(christmasLook({ ...DEFAULT_SITE_SETTINGS, christmas_mode: "on" }, "2026-11-11")).not.toBeNull();
  });

  it("shows nothing when off, even on Christmas Day", () => {
    expect(christmasLook({ ...DEFAULT_SITE_SETTINGS, christmas_mode: "off" }, "2026-12-25")).toBeNull();
  });

  it("uses the teacher's own message, and drops the parts switched off", () => {
    expect(
      christmasLook(
        { ...DEFAULT_SITE_SETTINGS, christmas_snow: false, christmas_message: "  Χρόνια πολλά!  " },
        "2026-12-10",
      ),
    ).toEqual({ snow: false, hat: true, message: "Χρόνια πολλά!" });
    expect(
      christmasLook({ ...DEFAULT_SITE_SETTINGS, christmas_banner: false }, "2026-12-10")?.message,
    ).toBeNull();
  });

  it("is null when every part is switched off", () => {
    expect(
      christmasLook(
        { ...DEFAULT_SITE_SETTINGS, christmas_snow: false, christmas_hat: false, christmas_banner: false },
        "2026-12-10",
      ),
    ).toBeNull();
  });
});

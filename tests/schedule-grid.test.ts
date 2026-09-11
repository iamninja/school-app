import { describe, it, expect } from "vitest";
import {
  lessonTimeLabel,
  recurringLessonWindow,
  windowToRowGeometry,
  SCHEDULE_ROWS,
} from "@/lib/schedule-grid";

describe("recurringLessonWindow", () => {
  it("runs the grid's first two weekday rows back to back with no break", () => {
    expect(recurringLessonWindow("Mon", "14:30")).toEqual({
      start: "14:30",
      end: "15:15",
    });
    expect(recurringLessonWindow("Mon", "15:15")).toEqual({
      start: "15:15",
      end: "16:00",
    });
  });

  it("gives every other weekday row a 15-minute break before 45 minutes of teaching", () => {
    expect(recurringLessonWindow("Wed", "18:00")).toEqual({
      start: "18:15",
      end: "19:00",
    });
    expect(recurringLessonWindow("Wed", "16:00")).toEqual({
      start: "16:15",
      end: "17:00",
    });
  });

  it("falls back to the standard 60-minute-slot shape for the last row in the grid", () => {
    expect(recurringLessonWindow("Fri", "23:00")).toEqual({
      start: "23:15",
      end: "00:00",
    });
  });

  it("applies the same break-by-gap rule to the Saturday column, which has no back-to-back pair", () => {
    // Saturday's own grid has a uniform 60-minute gap between every row -
    // unlike weekday's first two rows, there is no back-to-back exception.
    expect(recurringLessonWindow("Sat", "08:00")).toEqual({
      start: "08:15",
      end: "09:00",
    });
    expect(recurringLessonWindow("Sat", "12:00")).toEqual({
      start: "12:15",
      end: "13:00",
    });
  });

  it("falls back to a 15-minute break plus 45 minutes for a time not on the grid at all", () => {
    expect(recurringLessonWindow("Mon", "15:00")).toEqual({
      start: "15:15",
      end: "16:00",
    });
  });

  it("spans two rows for a two-hour lesson, ending at the row after next", () => {
    expect(recurringLessonWindow("Wed", "16:00", true)).toEqual({
      start: "16:15",
      end: "18:00",
    });
  });

  it("falls back to a flat two-hour shape for a two-hour lesson starting on the last row", () => {
    expect(recurringLessonWindow("Fri", "23:00", true)).toEqual({
      start: "23:15",
      end: "01:00",
    });
  });

  describe("lessonTimeLabel", () => {
    it("shows just the start time for a 1-hour lesson", () => {
      expect(lessonTimeLabel("16:00", false)).toBe("16:00");
    });

    it("shows a start-end range for a two-hour lesson", () => {
      expect(lessonTimeLabel("16:00", true)).toBe("16:00–18:00");
    });

    it("wraps past midnight for a two-hour lesson starting late", () => {
      expect(lessonTimeLabel("23:00", true)).toBe("23:00–01:00");
    });

    it("prefers a known real end time over the two-hour default", () => {
      expect(lessonTimeLabel("16:00", true, "17:30")).toBe("16:00–17:30");
    });

    it("uses a real end time even for a non-two-hour lesson", () => {
      expect(lessonTimeLabel("16:00", false, "16:45")).toBe("16:00–16:45");
    });
  });

  describe("windowToRowGeometry", () => {
    it("positions a window entirely within one 60-minute row (the plan's worked example)", () => {
      // Row 2 is 16:00-17:00. 16:15-17:00 starts a quarter of the way in
      // and runs to the row's exact bottom edge.
      expect(windowToRowGeometry("Wed", { start: "16:15", end: "17:00" })).toEqual({
        startRow: 2,
        endRow: 2,
        topPct: 25,
        heightPct: 75,
      });
    });

    it("positions a window entirely within a 45-minute row (row 0, back-to-back with row 1)", () => {
      // Row 0 is 14:30-15:15 (45 min). A lesson starting 15 min in and
      // running the full remaining 30 min: top = 15/45, height = 30/45.
      const result = windowToRowGeometry("Mon", { start: "14:45", end: "15:15" });
      expect(result?.startRow).toBe(0);
      expect(result?.endRow).toBe(0);
      expect(result?.topPct).toBeCloseTo((15 / 45) * 100);
      expect(result?.heightPct).toBeCloseTo((30 / 45) * 100);
    });

    it("spans into the next row when a custom window spills past its anchor row's real duration", () => {
      // Row 1 (15:15-16:00, 45 min) into row 2 (16:00-17:00, 60 min) - the
      // two rows have different real durations, so this exercises the
      // uniform-row-unit math, not just a linear minutes split.
      const result = windowToRowGeometry("Mon", { start: "15:45", end: "16:30" });
      expect(result?.startRow).toBe(1);
      expect(result?.endRow).toBe(2);
      // start: 30/45 of the way through row 1 = row-unit 1.667; end: 30/60
      // of the way through row 2 = row-unit 2.5. Both as a fraction of the
      // 2-row span (1 to 3 in row-units).
      expect(result?.topPct).toBeCloseTo(((1 + 30 / 45 - 1) / 2) * 100);
      expect(result?.heightPct).toBeCloseTo((((2 + 30 / 60) - (1 + 30 / 45)) / 2) * 100);
    });

    it("treats a window ending exactly on a row boundary as ending at the row above, not spilling into the next", () => {
      // 14:30-15:15 is exactly row 0's own full span - must not span into
      // row 1 just because 15:15 is also row 1's start time.
      expect(windowToRowGeometry("Mon", { start: "14:30", end: "15:15" })).toEqual({
        startRow: 0,
        endRow: 0,
        topPct: 0,
        heightPct: 100,
      });
    });

    it("uses the Saturday column's own axis, not the weekday one", () => {
      // Saturday row 2 is satTime 10:00-11:00.
      expect(windowToRowGeometry("Sat", { start: "10:15", end: "11:00" })).toEqual({
        startRow: 2,
        endRow: 2,
        topPct: 25,
        heightPct: 75,
      });
    });

    it("returns null for a window outside the grid's axis entirely", () => {
      expect(windowToRowGeometry("Mon", { start: "05:00", end: "05:45" })).toBeNull();
    });
  });

  it("SCHEDULE_ROWS still has exactly ten rows, Mon-Fri and Saturday columns paired 1:1", () => {
    expect(SCHEDULE_ROWS).toHaveLength(10);
    for (const row of SCHEDULE_ROWS) {
      expect(row.time).toMatch(/^\d{2}:\d{2}$/);
      expect(row.satTime).toMatch(/^\d{2}:\d{2}$/);
    }
  });
});

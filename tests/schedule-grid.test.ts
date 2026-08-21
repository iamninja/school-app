import { describe, it, expect } from "vitest";
import { recurringLessonWindow, SCHEDULE_ROWS } from "@/lib/schedule-grid";

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

  it("SCHEDULE_ROWS still has exactly ten rows, Mon-Fri and Saturday columns paired 1:1", () => {
    expect(SCHEDULE_ROWS).toHaveLength(10);
    for (const row of SCHEDULE_ROWS) {
      expect(row.time).toMatch(/^\d{2}:\d{2}$/);
      expect(row.satTime).toMatch(/^\d{2}:\d{2}$/);
    }
  });
});

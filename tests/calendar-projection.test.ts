import { describe, it, expect } from "vitest";
import {
  projectOccurrences,
  toIsoDate,
  fromIsoDate,
  eachIsoDateInRange,
  weekdayLabelFromDate,
  type ProjectionInput,
} from "@/lib/calendar-projection";

const CLASS_A = { id: "class-a", name: "Class A", archivedAt: null };
const CLASS_B = { id: "class-b", name: "Class B", archivedAt: null };

function baseInput(overrides: Partial<ProjectionInput> = {}): ProjectionInput {
  return {
    from: "2026-09-01",
    to: "2026-09-07",
    slots: [],
    classes: [CLASS_A, CLASS_B],
    events: [],
    ...overrides,
  };
}

describe("eachIsoDateInRange / toIsoDate / fromIsoDate", () => {
  it("is inclusive on both ends", () => {
    expect(eachIsoDateInRange("2026-09-01", "2026-09-03")).toEqual([
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
    ]);
  });

  it("round-trips a local-midnight date without shifting a day (timezone safety)", () => {
    const date = new Date(2026, 2, 29, 0, 0, 0);
    expect(toIsoDate(date)).toBe("2026-03-29");
    expect(toIsoDate(fromIsoDate("2026-03-29"))).toBe("2026-03-29");
  });

  it("produces no duplicate or missing day across a DST-transition week", () => {
    // Greece switches to EEST on the last Sunday of March.
    const dates = eachIsoDateInRange("2026-03-27", "2026-04-02");
    expect(dates).toHaveLength(7);
    expect(new Set(dates).size).toBe(7);
  });
});

describe("weekdayLabelFromDate", () => {
  it("matches Date#getDay() indexing", () => {
    // 2026-09-07 is a Monday.
    expect(weekdayLabelFromDate(new Date(2026, 8, 7))).toBe("Mon");
    expect(weekdayLabelFromDate(new Date(2026, 8, 12))).toBe("Sat");
  });
});

describe("projectOccurrences - template only", () => {
  it("projects a Mon/Wed class over one week", () => {
    const result = projectOccurrences(
      baseInput({
        slots: [
          { classId: CLASS_A.id, day: "Mon", time: "15:00" },
          { classId: CLASS_A.id, day: "Wed", time: "15:00" },
        ],
      }),
    );

    // 2026-09-01 is a Tuesday, so within this week Wed falls on 09-02 and
    // Mon falls on 09-07.
    expect(result).toHaveLength(2);
    expect(result.every((o) => o.kind === "recurring")).toBe(true);
    expect(result.map((o) => o.date)).toEqual(["2026-09-02", "2026-09-07"]);
    expect(result[0].startTime).toBe("15:00");
    expect(result[0].className).toBe("Class A");
  });

  it("projects a Saturday slot at its own stored time, with no offset applied", () => {
    const result = projectOccurrences(
      baseInput({
        slots: [{ classId: CLASS_A.id, day: "Sat", time: "08:00" }],
      }),
    );
    expect(result).toHaveLength(1);
    expect(result[0].date).toBe("2026-09-05");
    expect(result[0].startTime).toBe("08:00");
  });

  it("excludes an archived class by default and includes it when asked", () => {
    const input = baseInput({
      classes: [{ ...CLASS_A, archivedAt: "2026-08-01T00:00:00Z" }],
      slots: [{ classId: CLASS_A.id, day: "Mon", time: "15:00" }],
    });
    expect(projectOccurrences(input)).toHaveLength(0);
    expect(
      projectOccurrences({ ...input, includeArchivedClasses: true }),
    ).toHaveLength(1);
  });

  it("does not project a class before its start date or after its finish date", () => {
    // 2026-09-02 (Wed) and 2026-09-07 (Mon) both fall inside the window.
    const input = baseInput({
      classes: [
        { ...CLASS_A, startDate: "2026-09-02", finishDate: "2026-09-02" },
      ],
      slots: [
        { classId: CLASS_A.id, day: "Wed", time: "15:00" },
        { classId: CLASS_A.id, day: "Mon", time: "15:00" },
      ],
    });
    const result = projectOccurrences(input);
    expect(result).toHaveLength(1);
    expect(result[0].date).toBe("2026-09-02");
  });

  it("still projects indefinitely when startDate/finishDate are absent", () => {
    const input = baseInput({
      classes: [CLASS_A],
      slots: [{ classId: CLASS_A.id, day: "Wed", time: "15:00" }],
    });
    expect(projectOccurrences(input)).toHaveLength(1);
  });

  it("treats the start/finish dates as inclusive boundaries", () => {
    const input = baseInput({
      from: "2026-09-01",
      to: "2026-09-01",
      classes: [
        { ...CLASS_A, startDate: "2026-09-01", finishDate: "2026-09-01" },
      ],
      slots: [{ classId: CLASS_A.id, day: "Tue", time: "15:00" }],
    });
    expect(projectOccurrences(input)).toHaveLength(1);
  });
});

describe("projectOccurrences - cancellations", () => {
  it("marks a whole-day cancellation as cancelled", () => {
    const result = projectOccurrences(
      baseInput({
        slots: [{ classId: CLASS_A.id, day: "Mon", time: "15:00" }],
        events: [
          {
            id: "evt-1",
            event_type: "cancellation",
            event_date: "2026-09-07",
            start_time: null,
            end_time: null,
            class_id: CLASS_A.id,
            class_name: "Class A",
            student_id: null,
            student_name: null,
            contact_name: null,
            title: null,
            notes: null,
          },
        ],
      }),
    );
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe("cancelled");
    expect(result[0].eventId).toBe("evt-1");
  });

  it("cancels only the matching occurrence when a class meets twice the same weekday", () => {
    const result = projectOccurrences(
      baseInput({
        slots: [
          { classId: CLASS_A.id, day: "Mon", time: "14:30" },
          { classId: CLASS_A.id, day: "Mon", time: "18:00" },
        ],
        events: [
          {
            id: "evt-1",
            event_type: "cancellation",
            event_date: "2026-09-07",
            start_time: "14:30",
            end_time: null,
            class_id: CLASS_A.id,
            class_name: "Class A",
            student_id: null,
            student_name: null,
            contact_name: null,
            title: null,
            notes: null,
          },
        ],
      }),
    );
    expect(result).toHaveLength(2);
    const byTime = new Map(result.map((o) => [o.startTime, o.kind]));
    expect(byTime.get("14:30")).toBe("cancelled");
    expect(byTime.get("18:00")).toBe("recurring");
  });

  it("still emits a standalone cancelled occurrence when there is no matching template slot", () => {
    const result = projectOccurrences(
      baseInput({
        slots: [],
        events: [
          {
            id: "evt-1",
            event_type: "cancellation",
            event_date: "2026-09-07",
            start_time: "15:00",
            end_time: null,
            class_id: CLASS_A.id,
            class_name: "Class A",
            student_id: null,
            student_name: null,
            contact_name: null,
            title: null,
            notes: null,
          },
        ],
      }),
    );
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe("cancelled");
    expect(result[0].className).toBe("Class A");
  });

  it("still renders a cancellation whose class has been deleted, from its snapshot", () => {
    const result = projectOccurrences(
      baseInput({
        classes: [],
        slots: [],
        events: [
          {
            id: "evt-1",
            event_type: "cancellation",
            event_date: "2026-09-07",
            start_time: null,
            end_time: null,
            class_id: null,
            class_name: "Deleted Class",
            student_id: null,
            student_name: null,
            contact_name: null,
            title: null,
            notes: null,
          },
        ],
      }),
    );
    expect(result).toHaveLength(1);
    expect(result[0].className).toBe("Deleted Class");
    expect(result[0].classId).toBeNull();
  });
});

describe("projectOccurrences - extra sessions, ad-hoc, trial, block", () => {
  const extraSession = {
    id: "evt-extra",
    event_type: "extra_session" as const,
    event_date: "2026-09-03",
    start_time: "17:00",
    end_time: null,
    class_id: CLASS_A.id,
    class_name: "Class A",
    student_id: null,
    student_name: null,
    contact_name: null,
    title: null,
    notes: null,
  };
  const adHoc = {
    id: "evt-adhoc",
    event_type: "ad_hoc_lesson" as const,
    event_date: "2026-09-03",
    start_time: "18:00",
    end_time: null,
    class_id: null,
    class_name: null,
    student_id: "student-1",
    student_name: "Student One",
    contact_name: null,
    title: null,
    notes: null,
  };
  const trial = {
    id: "evt-trial",
    event_type: "trial_lesson" as const,
    event_date: "2026-09-03",
    start_time: "10:00",
    end_time: null,
    class_id: null,
    class_name: null,
    student_id: null,
    student_name: null,
    contact_name: "Prospective Person",
    title: null,
    notes: null,
  };
  const block = {
    id: "evt-block",
    event_type: "block" as const,
    event_date: "2026-09-03",
    start_time: "09:00",
    end_time: "10:00",
    class_id: null,
    class_name: null,
    student_id: null,
    student_name: null,
    contact_name: null,
    title: "Dentist",
    notes: null,
  };

  it("includes an extra session outside the template", () => {
    const result = projectOccurrences(
      baseInput({ slots: [], events: [extraSession] }),
    );
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe("extra_session");
  });

  it("excludes an extra session whose class is archived, unless included", () => {
    const input = baseInput({
      classes: [{ ...CLASS_A, archivedAt: "2026-08-01T00:00:00Z" }],
      slots: [],
      events: [extraSession],
    });
    expect(projectOccurrences(input)).toHaveLength(0);
    expect(
      projectOccurrences({ ...input, includeArchivedClasses: true }),
    ).toHaveLength(1);
  });

  it("includes an ad_hoc_lesson and a trial_lesson", () => {
    const result = projectOccurrences(
      baseInput({ slots: [], events: [adHoc, trial] }),
    );
    expect(result.map((o) => o.kind).sort()).toEqual([
      "ad_hoc_lesson",
      "trial_lesson",
    ]);
  });

  it("includes a block by default and excludes it when includeBlocks is false", () => {
    const input = baseInput({ slots: [], events: [block] });
    expect(projectOccurrences(input)).toHaveLength(1);
    expect(projectOccurrences({ ...input, includeBlocks: false })).toHaveLength(0);
  });

  it("sorts a day's occurrences with whole-day items first, then by start time", () => {
    const wholeDay = { ...block, id: "evt-whole", start_time: null, end_time: null };
    const result = projectOccurrences(
      baseInput({ slots: [], events: [trial, wholeDay] }),
    );
    expect(result.map((o) => o.eventId)).toEqual(["evt-whole", "evt-trial"]);
  });
});

describe("projectOccurrences - date range boundaries", () => {
  it("includes events exactly on the from/to boundary and excludes ones outside it", () => {
    const inRangeStart = {
      id: "evt-start",
      event_type: "block" as const,
      event_date: "2026-09-01",
      start_time: null,
      end_time: null,
      class_id: null,
      class_name: null,
      student_id: null,
      student_name: null,
      contact_name: null,
      title: "In range",
      notes: null,
    };
    const outOfRange = { ...inRangeStart, id: "evt-out", event_date: "2026-08-31" };
    const result = projectOccurrences(
      baseInput({ slots: [], events: [inRangeStart, outOfRange] }),
    );
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("In range");
  });
});

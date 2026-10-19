import { describe, expect, it } from "vitest";
import {
  CANCELLATION_REASON_LABELS_EL,
  cancelledLessonLabel,
  formatClosureRangeEl,
  planClosure,
  upcomingClosurePresets,
} from "@/lib/school-closures";
import { projectOccurrences } from "@/lib/calendar-projection";
import { noticesForClosure } from "@/lib/push/lesson-changes";

const CLASS_A = { id: "class-a", name: "Class A", archivedAt: null };
const CLASS_B = { id: "class-b", name: "Class B", archivedAt: null };
const ARCHIVED = { id: "class-old", name: "Old", archivedAt: "2026-09-01T00:00:00Z" };

const SLOTS = [
  { classId: "class-a", day: "Mon", time: "16:00" },
  { classId: "class-a", day: "Wed", time: "17:00" },
  { classId: "class-b", day: "Wed", time: "18:00" },
  { classId: "class-old", day: "Wed", time: "19:00" },
];

function event(overrides: Record<string, unknown>) {
  return {
    id: "evt",
    event_type: "cancellation" as const,
    event_date: "2026-10-28",
    start_time: null,
    end_time: null,
    class_id: null,
    class_name: null,
    student_id: null,
    student_name: null,
    contact_name: null,
    title: null,
    notes: null,
    ...overrides,
  };
}

describe("upcomingClosurePresets", () => {
  const presets = upcomingClosurePresets("2026-10-19");
  const byKey = new Map(presets.map((preset) => [preset.key, preset]));

  it("offers the Greek school breaks with their fixed rules", () => {
    expect(byKey.get("christmas-2026")).toMatchObject({
      reason: "christmas",
      from: "2026-12-24",
      to: "2027-01-07",
    });
    // Orthodox Easter 2027 is 2 May: Holy Monday to Thomas Sunday.
    expect(byKey.get("easter-2027")).toMatchObject({
      reason: "easter",
      from: "2027-04-26",
      to: "2027-05-09",
    });
  });

  it("places the movable holidays relative to Orthodox Easter", () => {
    expect(byKey.get("clean-monday-2027")?.from).toBe("2027-03-15");
    expect(byKey.get("holy-spirit-2027")?.from).toBe("2027-06-21");
  });

  it("drops a single holiday that falls inside the Easter break", () => {
    // 1 May 2027 is inside 26/4-9/5.
    expect(byKey.has("labour-2027")).toBe(false);
  });

  it("lists only what is still ahead, soonest first", () => {
    expect(presets[0].key).toBe("ohi-2026");
    expect(presets.every((preset) => preset.to >= "2026-10-19")).toBe(true);
    const froms = presets.map((preset) => preset.from);
    expect(froms).toEqual([...froms].sort());
    expect(byKey.has("ohi-2025")).toBe(false);
  });

  it("keeps a break that is already under way", () => {
    const duringChristmas = upcomingClosurePresets("2027-01-03");
    expect(duringChristmas[0].key).toBe("christmas-2026");
  });
});

describe("formatClosureRangeEl", () => {
  it("reads like a lock-screen date", () => {
    expect(formatClosureRangeEl("2026-10-28", "2026-10-28")).toBe("28/10");
    expect(formatClosureRangeEl("2026-12-24", "2027-01-07")).toBe("24/12–7/1");
  });
});

describe("planClosure", () => {
  const base = {
    from: "2026-10-26",
    to: "2026-10-28",
    slots: SLOTS,
    classes: [CLASS_A, CLASS_B, ARCHIVED],
  };

  it("cancels every template occurrence in the range, skipping archived classes", () => {
    const { toCancel } = planClosure({ ...base, events: [] });
    expect(
      toCancel.map((o) => `${o.date} ${o.slotTime} ${o.classId}`),
    ).toEqual([
      "2026-10-26 16:00 class-a",
      "2026-10-28 17:00 class-a",
      "2026-10-28 18:00 class-b",
    ]);
  });

  it("skips lessons already cancelled and lists extra/one-off lessons it doesn't cover", () => {
    const { toCancel, notCovered } = planClosure({
      ...base,
      events: [
        event({ id: "c1", class_id: "class-b", class_name: "Class B", start_time: "18:00" }),
        event({
          id: "x1",
          event_type: "extra_session",
          class_id: "class-b",
          class_name: "Class B",
          start_time: "10:00",
          event_date: "2026-10-27",
        }),
        event({
          id: "b1",
          event_type: "block",
          title: "Dentist",
          event_date: "2026-10-27",
        }),
      ],
    });
    expect(toCancel.map((o) => o.classId)).toEqual(["class-a", "class-a"]);
    expect(notCovered.map((o) => o.eventId)).toEqual(["x1"]);
  });
});

describe("projection of a closure's cancellations", () => {
  it("carries the reason, closure and note onto the cancelled occurrence", () => {
    const [occurrence] = projectOccurrences({
      from: "2026-10-28",
      to: "2026-10-28",
      slots: [{ classId: "class-a", day: "Wed", time: "17:00" }],
      classes: [CLASS_A],
      events: [
        event({
          id: "c1",
          class_id: "class-a",
          class_name: "Class A",
          start_time: "17:00",
          notes: "28η Οκτωβρίου",
          cancellation_reason: "public_holiday",
          closure_id: "closure-1",
        }),
      ],
    });
    expect(occurrence).toMatchObject({
      kind: "cancelled",
      cancellationReason: "public_holiday",
      closureId: "closure-1",
      notes: "28η Οκτωβρίου",
    });
  });

  it("leaves a plain template occurrence without a reason", () => {
    const [occurrence] = projectOccurrences({
      from: "2026-10-28",
      to: "2026-10-28",
      slots: [{ classId: "class-a", day: "Wed", time: "17:00" }],
      classes: [CLASS_A],
      events: [],
    });
    expect(occurrence).toMatchObject({
      kind: "recurring",
      cancellationReason: null,
      closureId: null,
    });
  });
});

describe("noticesForClosure", () => {
  const rows = [
    { event_date: "2026-12-28", class_id: "class-a", class_name: "Class A" },
    { event_date: "2026-12-24", class_id: "class-a", class_name: "Class A" },
    { event_date: "2027-01-07", class_id: "class-a", class_name: "Class A" },
    { event_date: "2026-12-29", class_id: "class-b", class_name: "Class B" },
    { event_date: "2026-12-20", class_id: "class-c", class_name: "Past only" },
  ];

  it("sends one notice per class spanning its own lessons, none for past-only classes", () => {
    const notices = noticesForClosure(
      rows,
      { kind: "closed", reasonLabel: "Διακοπές Χριστουγέννων" },
      "closure-1",
      "2026-12-22",
    );
    expect(notices).toEqual([
      {
        event: "lessons_closed",
        to: { kind: "class_students", classId: "class-a" },
        classId: "class-a",
        values: { class: "Class A", date: "24/12–7/1", reason: "Διακοπές Χριστουγέννων" },
        tag: "closure-closure-1-class-a",
      },
      {
        event: "lessons_closed",
        to: { kind: "class_students", classId: "class-b" },
        classId: "class-b",
        values: { class: "Class B", date: "29/12", reason: "Διακοπές Χριστουγέννων" },
        tag: "closure-closure-1-class-b",
      },
    ]);
  });

  it("only counts lessons from today on when the closure is already under way", () => {
    const [notice] = noticesForClosure(rows, { kind: "reopened" }, "closure-1", "2026-12-26");
    expect(notice).toMatchObject({
      event: "lessons_reopened",
      values: { class: "Class A", date: "28/12–7/1", reason: null },
    });
  });
});

describe("cancelledLessonLabel", () => {
  it("shows a holiday on its own, and an unplanned closure as a cancellation", () => {
    expect(cancelledLessonLabel("christmas", "Ακύρωση", CANCELLATION_REASON_LABELS_EL)).toBe(
      "Διακοπές Χριστουγέννων",
    );
    expect(cancelledLessonLabel("public_holiday", "Ακύρωση", CANCELLATION_REASON_LABELS_EL)).toBe(
      "Αργία",
    );
    expect(cancelledLessonLabel("strike", "Ακύρωση", CANCELLATION_REASON_LABELS_EL)).toBe(
      "Ακύρωση · Απεργία",
    );
    expect(cancelledLessonLabel(null, "Ακύρωση", CANCELLATION_REASON_LABELS_EL)).toBe("Ακύρωση");
  });
});

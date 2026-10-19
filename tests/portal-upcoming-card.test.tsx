import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PortalUpcomingCard } from "@/components/portal-upcoming-card";

const CLASSES = [{ id: "class-a", name: "Άλγεβρα", archivedAt: null }];
const SCHEDULES = [
  { class_id: "class-a", day: "Mon", time: "16:00" },
  { class_id: "class-a", day: "Wed", time: "17:00" },
];

function christmasCancellation(date: string, time: string) {
  return {
    id: `xmas-${date}`,
    event_type: "cancellation" as const,
    event_date: date,
    start_time: time,
    end_time: null,
    class_id: "class-a",
    class_name: "Άλγεβρα",
    notes: null,
    cancellation_reason: "christmas" as const,
  };
}

describe("PortalUpcomingCard during a school break", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 11, 22, 9, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the break as one line instead of each lesson crossed out", () => {
    render(
      <PortalUpcomingCard
        classes={CLASSES}
        schedules={SCHEDULES}
        calendarEvents={[
          christmasCancellation("2026-12-28", "16:00"),
          christmasCancellation("2026-12-30", "17:00"),
          christmasCancellation("2027-01-04", "16:00"),
        ]}
      />,
    );

    expect(screen.getByText("Διακοπές Χριστουγέννων")).toBeInTheDocument();
    expect(screen.getByText("28 Δεκεμβρίου – 4 Ιανουαρίου")).toBeInTheDocument();
    // The lesson before the break is still listed; nothing says "Ακύρωση".
    expect(screen.getAllByText("Άλγεβρα")).toHaveLength(1);
    expect(screen.queryByText(/Ακύρωση/)).not.toBeInTheDocument();
  });
});

import { athensDateAndTime, formatShortDateEl } from "@/lib/push/athens-time";

/**
 * {date}/{time} for a test: a mock exam's scheduled date and time, or a
 * short assessment's deadline ("έως 14/10 18:00"). Open short assessments
 * have neither.
 */
export function assessmentWhen(input: {
  kind: string;
  scheduledDate: string | null;
  scheduledTime: string | null;
  deadlineAt: string | null;
}): { date: string | null; time: string | null; day: string | null } {
  if (input.kind === "mock_exam") {
    return {
      date: input.scheduledDate ? formatShortDateEl(input.scheduledDate) : null,
      time: input.scheduledTime,
      day: input.scheduledDate,
    };
  }
  if (input.deadlineAt) {
    const { date, time } = athensDateAndTime(input.deadlineAt);
    return { date: `έως ${formatShortDateEl(date)}`, time, day: date };
  }
  return { date: null, time: null, day: null };
}

/** Homework text is a lock-screen line, not a page. */
export function shortNote(note: string): string {
  const oneLine = note.replace(/\s+/g, " ").trim();
  return oneLine.length > 120 ? `${oneLine.slice(0, 119)}…` : oneLine;
}

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fromIsoDate,
  projectOccurrences,
  weekdayLabelFromDate,
  type ProjectionEvent,
} from "@/lib/calendar-projection";
import { slotWindow, timeToMinutes } from "@/lib/schedule-grid";

/**
 * A class's real lessons over a date range - the same projection the
 * calendar shows (template slots, custom end times, two-hour slots, extra
 * sessions, cancellations, the class's start/finish dates) - with each
 * lesson's end time worked out.
 */
export type ClassLesson = { date: string; start: string | null; end: string | null };

function minutesToTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export async function classLessons(
  supabase: SupabaseClient,
  classId: string,
  from: string,
  to: string,
): Promise<ClassLesson[]> {
  const [{ data: classRow }, { data: slots }, { data: events }] = await Promise.all([
    supabase
      .from("classes")
      .select("id, name, archived_at, start_date, finish_date")
      .eq("id", classId)
      .maybeSingle(),
    supabase
      .from("class_schedule_slots")
      .select("day, time, class_id, is_two_hour, end_time")
      .eq("class_id", classId),
    supabase
      .from("calendar_events")
      .select(
        "id, event_type, event_date, start_time, end_time, class_id, class_name, student_id, student_name, contact_name, title, notes",
      )
      .eq("class_id", classId)
      .gte("event_date", from)
      .lte("event_date", to),
  ]);
  if (!classRow || classRow.archived_at) return [];

  const slotRows = (slots ?? []) as {
    day: string;
    time: string;
    class_id: string;
    is_two_hour: boolean | null;
    end_time: string | null;
  }[];

  return projectOccurrences({
    from,
    to,
    slots: slotRows.map((slot) => ({
      classId: slot.class_id,
      day: slot.day,
      time: slot.time,
      isTwoHour: Boolean(slot.is_two_hour),
      endTime: slot.end_time,
    })),
    classes: [
      {
        id: classRow.id,
        name: classRow.name,
        archivedAt: null,
        startDate: classRow.start_date,
        finishDate: classRow.finish_date,
      },
    ],
    events: (events ?? []) as ProjectionEvent[],
    includeBlocks: false,
  })
    .filter(
      (o) =>
        o.classId === classId && (o.kind === "recurring" || o.kind === "extra_session"),
    )
    .map((o) => {
      let end = o.endTime;
      if (!end && o.startTime) {
        if (o.kind === "recurring" && o.slotTime) {
          const slot = slotRows.find((s) => s.time === o.slotTime);
          end = slotWindow(weekdayLabelFromDate(fromIsoDate(o.date)), o.slotTime, {
            isTwoHour: Boolean(slot?.is_two_hour),
          }).end;
        } else {
          end = minutesToTime(timeToMinutes(o.startTime) + (o.isTwoHour ? 120 : 60));
        }
      }
      return { date: o.date, start: o.startTime, end };
    })
    .sort((a, b) => (a.date + (a.start ?? "")).localeCompare(b.date + (b.start ?? "")));
}

"use client";

import { format } from "date-fns";
import { el } from "date-fns/locale";
import { CalendarClockIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  fromIsoDate,
  nextOccurrences,
  type ProjectionClass,
  type ProjectionEvent,
  type ProjectionSlot,
} from "@/lib/calendar-projection";
import { CALENDAR_EVENT_TYPE_LABELS_EL } from "@/lib/greek-labels";

/**
 * Shared by both portals - what's coming up over the next couple of weeks,
 * folding the recurring weekly template together with any cancellation or
 * extra/one-off session. Blocks are never passed in (they're teacher-only,
 * excluded upstream by RLS), so includeBlocks is deliberately not exposed
 * here.
 */
export function PortalUpcomingCard({
  classes,
  schedules,
  calendarEvents,
  days = 14,
  limit = 5,
}: {
  classes: Array<{ id: string; name: string; archivedAt: string | null }>;
  schedules: Array<{ class_id: string; day: string; time: string }>;
  calendarEvents: Array<{
    id: string;
    event_type: "cancellation" | "extra_session" | "ad_hoc_lesson";
    event_date: string;
    start_time: string | null;
    end_time: string | null;
    class_id: string | null;
    class_name: string | null;
    notes: string | null;
  }>;
  days?: number;
  limit?: number;
}) {
  const projectionClasses: ProjectionClass[] = classes;
  const projectionSlots: ProjectionSlot[] = schedules.map((slot) => ({
    classId: slot.class_id,
    day: slot.day,
    time: slot.time,
  }));
  const projectionEvents: ProjectionEvent[] = calendarEvents.map((event) => ({
    id: event.id,
    event_type: event.event_type,
    event_date: event.event_date,
    start_time: event.start_time,
    end_time: event.end_time,
    class_id: event.class_id,
    class_name: event.class_name,
    student_id: null,
    student_name: null,
    contact_name: null,
    title: null,
    notes: event.notes,
  }));

  const today = new Date();
  const from = format(today, "yyyy-MM-dd");
  const to = format(
    new Date(today.getTime() + days * 24 * 60 * 60 * 1000),
    "yyyy-MM-dd",
  );

  const occurrences = nextOccurrences(
    {
      from,
      to,
      slots: projectionSlots,
      classes: projectionClasses,
      events: projectionEvents,
      includeBlocks: false,
    },
    limit,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarClockIcon className="size-4 text-brand" aria-hidden="true" />
          Επόμενα μαθήματα
        </CardTitle>
      </CardHeader>
      <CardContent>
        {occurrences.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Δεν υπάρχουν προγραμματισμένα μαθήματα.
          </p>
        ) : (
          <div className="space-y-2">
            {occurrences.map((occurrence, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-background/60 px-3 py-2"
              >
                <div
                  className={cn(
                    "min-w-0",
                    occurrence.kind === "cancelled" &&
                      "text-muted-foreground line-through",
                  )}
                >
                  <p className="truncate text-sm font-medium">
                    {occurrence.className ??
                      occurrence.studentName ??
                      "Μάθημα"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {format(fromIsoDate(occurrence.date), "EEEE d MMMM", {
                      locale: el,
                    })}
                    {occurrence.startTime ? ` · ${occurrence.startTime}` : ""}
                  </p>
                </div>
                {occurrence.kind !== "recurring" ? (
                  <Badge
                    variant={
                      occurrence.kind === "cancelled"
                        ? "destructive"
                        : "outline"
                    }
                  >
                    {occurrence.kind === "cancelled"
                      ? CALENDAR_EVENT_TYPE_LABELS_EL.cancellation
                      : (CALENDAR_EVENT_TYPE_LABELS_EL[occurrence.kind] ??
                        occurrence.kind)}
                  </Badge>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

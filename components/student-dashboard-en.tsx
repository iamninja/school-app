"use client";

import { format } from "date-fns";
import { enUS } from "date-fns/locale";
import { CalendarDays, ClipboardCheck, ClockIcon, UserRound } from "lucide-react";

import {
  AttendanceChip,
  PortalShell,
  SectionLabel,
  StatTile,
} from "@/components/portal-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StudentQuizPanel } from "@/components/student-quiz-panel";
import { PortalHistoryDialog } from "@/components/portal-history-dialog";
import { PortalUpcomingCard } from "@/components/portal-upcoming-card";
import type {
  PortalCalendarEvent,
  QuizAttemptReview,
  QuizSummary,
} from "@/lib/types/database";
import {
  ATTENDANCE_STATUS_LABELS_EN,
  DAY_LABELS_EN,
  formatClassDateRangeEn,
} from "@/lib/portal-labels-en";

/**
 * English counterpart to student-dashboard.tsx, for the public /demo-en
 * preview page only - real students only ever see the Greek page. Kept as
 * a separate component rather than a `locale` prop on the real one since
 * this is pure layout/copy with no logic worth sharing (unlike
 * PortalUpcomingCard/StudentQuizPanel, which do carry real behavior).
 */
type StudentDashboardEnProps = {
  student: {
    id: string;
    firstName: string;
    lastName: string;
    gradeLevel: string | null;
    email: string | null;
    tuitionAmount: number | null;
  };
  parents: Array<{
    name: string | null;
    email: string | null;
    phone: string | null;
    is_primary: boolean;
  }>;
  classes: Array<{
    id: string;
    name: string;
    hoursPerWeek: number;
    archivedAt: string | null;
    startDate?: string | null;
    finishDate?: string | null;
  }>;
  schedules: Array<{
    class_id: string;
    day: string;
    time: string;
  }>;
  attendance: Array<{
    class_id: string | null;
    class_name: string;
    attendance_date: string;
    status: string;
  }>;
  quizzes: QuizSummary[];
  calendarEvents: PortalCalendarEvent[];
  demoMode?: boolean;
  demoReviews?: Record<string, QuizAttemptReview>;
};

const DAY_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const RECENT_PREVIEW_COUNT = 5;

function AttendanceRow({
  record,
  classes,
}: {
  record: {
    class_id: string | null;
    class_name: string;
    attendance_date: string;
    status: string;
  };
  classes: Array<{ id: string; name: string }>;
}) {
  const classInfo = classes.find((c) => c.id === record.class_id);
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-background/60 px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">
          {classInfo?.name || record.class_name}
        </p>
        <p className="text-xs text-muted-foreground">
          {format(new Date(record.attendance_date), "MMMM d, yyyy", {
            locale: enUS,
          })}
        </p>
      </div>
      <AttendanceChip
        status={record.status}
        label={ATTENDANCE_STATUS_LABELS_EN[record.status] ?? record.status}
      />
    </div>
  );
}

export function StudentDashboardEn(props: StudentDashboardEnProps) {
  const schedulesByClass = props.schedules.reduce(
    (acc, schedule) => {
      if (!acc[schedule.class_id]) {
        acc[schedule.class_id] = [];
      }
      acc[schedule.class_id].push(schedule);
      return acc;
    },
    {} as Record<string, typeof props.schedules>,
  );

  Object.keys(schedulesByClass).forEach((classId) => {
    schedulesByClass[classId].sort((a, b) => {
      const dayDiff = DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day);
      if (dayDiff !== 0) return dayDiff;
      return a.time.localeCompare(b.time);
    });
  });

  const attendanceStats = {
    present: props.attendance.filter((a) => a.status === "present").length,
    late: props.attendance.filter((a) => a.status === "late").length,
    absent: props.attendance.filter((a) => a.status === "absent").length,
  };
  const totalRecords =
    attendanceStats.present + attendanceStats.late + attendanceStats.absent;
  const attendanceRate =
    totalRecords > 0
      ? Math.round(
          ((attendanceStats.present + attendanceStats.late) / totalRecords) *
            100,
        )
      : 0;

  return (
    <PortalShell roleLabel="Student portal" demoMode={props.demoMode} locale="en">
      <div className="flex w-full flex-col gap-8">
        {/* Greeting */}
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            {format(new Date(), "EEEE, MMMM d, yyyy", { locale: enUS })}
          </p>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Welcome back, {props.student.firstName}
            <span className="text-brand">.</span>
          </h1>
          <p className="text-muted-foreground">
            Your schedule, attendance, and quizzes, all in one place.
          </p>
        </div>

        {/* Attendance stats */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatTile
            label="Attendance rate"
            value={totalRecords > 0 ? `${attendanceRate}%` : "—"}
            tone="brand"
          />
          <StatTile
            label={ATTENDANCE_STATUS_LABELS_EN.present}
            value={attendanceStats.present}
            tone="positive"
          />
          <StatTile
            label={ATTENDANCE_STATUS_LABELS_EN.late}
            value={attendanceStats.late}
            tone="warning"
          />
          <StatTile
            label={ATTENDANCE_STATUS_LABELS_EN.absent}
            value={attendanceStats.absent}
            tone="negative"
          />
        </div>

        <div className="grid items-start gap-6 xl:grid-cols-[1.4fr_1fr]">
          {/* Left column */}
          <div className="flex flex-col gap-6">
            <div className="space-y-3">
              <SectionLabel>My classes</SectionLabel>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <CalendarDays
                      className="size-4 text-brand"
                      aria-hidden="true"
                    />
                    Classes & Schedule
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {props.classes.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      You&apos;re not enrolled in any classes yet.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {props.classes.map((classItem) => (
                        <div
                          key={classItem.id}
                          className="space-y-3 rounded-xl border border-border/80 bg-background/60 p-4"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <h3 className="flex items-center gap-2 font-semibold">
                                {classItem.name}
                                {classItem.archivedAt ? (
                                  <Badge variant="secondary">Archived</Badge>
                                ) : null}
                              </h3>
                              <p className="text-sm text-muted-foreground">
                                {classItem.hoursPerWeek} hrs/week
                                {(() => {
                                  const range = formatClassDateRangeEn(
                                    classItem.startDate,
                                    classItem.finishDate,
                                  );
                                  return range ? ` · ${range}` : "";
                                })()}
                              </p>
                            </div>
                          </div>

                          {schedulesByClass[classItem.id]?.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                              {schedulesByClass[classItem.id].map(
                                (schedule, idx) => (
                                  <span
                                    key={idx}
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1 text-xs font-medium"
                                  >
                                    <ClockIcon
                                      className="size-3 text-brand"
                                      aria-hidden="true"
                                    />
                                    {DAY_LABELS_EN[schedule.day] ??
                                      schedule.day}{" "}
                                    at {schedule.time}
                                  </span>
                                ),
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="space-y-3">
              <SectionLabel>Quizzes</SectionLabel>
              <StudentQuizPanel
                quizzes={props.quizzes}
                demoReviews={props.demoReviews}
                locale="en"
              />
            </div>
          </div>

          {/* Right column */}
          <div className="flex flex-col gap-6">
            <div className="space-y-3">
              <SectionLabel>Coming up</SectionLabel>
              <PortalUpcomingCard
                classes={props.classes}
                schedules={props.schedules}
                calendarEvents={props.calendarEvents}
                locale="en"
              />
            </div>

            <div className="space-y-3">
              <SectionLabel>Attendance</SectionLabel>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-4">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <ClipboardCheck
                      className="size-4 text-brand"
                      aria-hidden="true"
                    />
                    Recent records
                  </CardTitle>
                  {props.attendance.length > RECENT_PREVIEW_COUNT ? (
                    <PortalHistoryDialog
                      triggerLabel="History"
                      title="Attendance"
                    >
                      {props.attendance.map((record, idx) => (
                        <AttendanceRow
                          key={idx}
                          record={record}
                          classes={props.classes}
                        />
                      ))}
                    </PortalHistoryDialog>
                  ) : null}
                </CardHeader>
                <CardContent>
                  {props.attendance.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No attendance records yet.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {props.attendance
                        .slice(0, RECENT_PREVIEW_COUNT)
                        .map((record, idx) => (
                          <AttendanceRow
                            key={idx}
                            record={record}
                            classes={props.classes}
                          />
                        ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="space-y-3">
              <SectionLabel>Details</SectionLabel>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <UserRound className="size-4 text-brand" aria-hidden="true" />
                    Personal details
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <dl className="grid gap-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-muted-foreground">Full name</dt>
                      <dd className="font-medium">
                        {props.student.firstName} {props.student.lastName}
                      </dd>
                    </div>
                    {props.student.gradeLevel && (
                      <div className="flex items-center justify-between gap-3">
                        <dt className="text-muted-foreground">Grade</dt>
                        <dd className="font-medium">
                          {props.student.gradeLevel}
                        </dd>
                      </div>
                    )}
                    {props.student.email && (
                      <div className="flex items-center justify-between gap-3">
                        <dt className="text-muted-foreground">Email</dt>
                        <dd className="truncate font-medium">
                          {props.student.email}
                        </dd>
                      </div>
                    )}
                  </dl>

                  {props.parents.length > 0 && (
                    <div className="border-t border-border/70 pt-4">
                      <p className="mb-2 text-sm font-medium">
                        Parent/guardian details
                      </p>
                      <div className="grid gap-2">
                        {props.parents.map((parent, idx) => (
                          <div
                            key={idx}
                            className="space-y-0.5 rounded-lg border border-border/70 bg-background/60 p-3"
                          >
                            {parent.name && (
                              <p className="text-sm font-medium">
                                {parent.name}
                              </p>
                            )}
                            {parent.email && (
                              <p className="text-xs text-muted-foreground">
                                {parent.email}
                              </p>
                            )}
                            {parent.phone && (
                              <p className="text-xs text-muted-foreground">
                                {parent.phone}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </PortalShell>
  );
}

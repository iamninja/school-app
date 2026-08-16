"use client";

import * as React from "react";
import { format } from "date-fns";
import { el } from "date-fns/locale";
import { Calendar, GraduationCap, Users, ClockIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { StudentQuizPanel } from "@/components/student-quiz-panel";
import type { QuizSummary } from "@/lib/types/database";
import {
  ATTENDANCE_STATUS_LABELS_EL,
  DAY_LABELS_EL,
  TUITION_STATUS_LABELS_EL,
} from "@/lib/greek-labels";

type StudentDashboardProps = {
  student: {
    id: string;
    firstName: string;
    lastName: string;
    gradeLevel: string | null;
    email: string | null;
    tuitionAmount: number | null;
    tuitionStatus: string;
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
  }>;
  schedules: Array<{
    class_id: string;
    day: string;
    time: string;
  }>;
  attendance: Array<{
    class_id: string;
    attendance_date: string;
    status: string;
  }>;
  quizzes: QuizSummary[];
};

const DAY_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function StudentDashboard(props: StudentDashboardProps) {
  const router = useRouter();

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
  };

  // Group schedules by class
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

  // Sort schedules by day and time
  Object.keys(schedulesByClass).forEach((classId) => {
    schedulesByClass[classId].sort((a, b) => {
      const dayDiff = DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day);
      if (dayDiff !== 0) return dayDiff;
      return a.time.localeCompare(b.time);
    });
  });

  // Calculate attendance statistics
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
    <div className="flex w-full flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <GraduationCap className="h-4 w-4" />
            Πίνακας μαθητή
          </div>
          <h1 className="text-2xl font-semibold">
            Καλωσήρθες, {props.student.firstName}!
          </h1>
          <p className="text-sm text-muted-foreground">
            Δείτε τις τάξεις, το πρόγραμμα και τις παρουσίες σας
          </p>
        </div>
        <Button onClick={handleSignOut} variant="outline">
          Αποσύνδεση
        </Button>
      </div>

      {/* Student Info Card */}
      <Card>
        <CardHeader>
          <CardTitle>Προσωπικά στοιχεία</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <p className="text-sm font-medium">Ονοματεπώνυμο</p>
              <p className="text-sm text-muted-foreground">
                {props.student.firstName} {props.student.lastName}
              </p>
            </div>
            {props.student.gradeLevel && (
              <div>
                <p className="text-sm font-medium">Τάξη</p>
                <p className="text-sm text-muted-foreground">
                  {props.student.gradeLevel}
                </p>
              </div>
            )}
            {props.student.email && (
              <div>
                <p className="text-sm font-medium">Email</p>
                <p className="text-sm text-muted-foreground">
                  {props.student.email}
                </p>
              </div>
            )}
            {props.student.tuitionStatus && (
              <div>
                <p className="text-sm font-medium">Κατάσταση διδάκτρων</p>
                <Badge
                  variant={
                    props.student.tuitionStatus === "current"
                      ? "default"
                      : props.student.tuitionStatus === "scholarship"
                        ? "secondary"
                        : "destructive"
                  }
                >
                  {TUITION_STATUS_LABELS_EL[props.student.tuitionStatus] ??
                    props.student.tuitionStatus}
                </Badge>
              </div>
            )}
          </div>

          {props.parents.length > 0 && (
            <div className="mt-4 border-t pt-4">
              <p className="text-sm font-medium mb-2">
                Στοιχεία γονέα/κηδεμόνα
              </p>
              <div className="grid gap-3 md:grid-cols-2">
                {props.parents.map((parent, idx) => (
                  <div
                    key={idx}
                    className="rounded-md border bg-muted/50 p-3 space-y-1"
                  >
                    {parent.name && (
                      <p className="text-sm font-medium">{parent.name}</p>
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

      {/* Classes and Schedule */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Οι τάξεις μου
          </CardTitle>
        </CardHeader>
        <CardContent>
          {props.classes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Δεν έχετε εγγραφεί σε καμία τάξη ακόμα.
            </p>
          ) : (
            <div className="space-y-4">
              {props.classes.map((classItem) => (
                <div
                  key={classItem.id}
                  className="rounded-lg border bg-card p-4 space-y-3"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="flex items-center gap-2 font-semibold">
                        {classItem.name}
                        {classItem.archivedAt ? (
                          <Badge variant="secondary">Αρχειοθετημένο</Badge>
                        ) : null}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {classItem.hoursPerWeek} ώρες/εβδομάδα
                      </p>
                    </div>
                  </div>

                  {schedulesByClass[classItem.id]?.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-sm font-medium flex items-center gap-2">
                        <ClockIcon className="h-4 w-4" />
                        Πρόγραμμα
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {schedulesByClass[classItem.id].map((schedule, idx) => (
                          <Badge key={idx} variant="outline">
                            {DAY_LABELS_EL[schedule.day] ?? schedule.day} στις{" "}
                            {schedule.time}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Attendance Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Επισκόπηση παρουσιών
          </CardTitle>
        </CardHeader>
        <CardContent>
          {totalRecords === 0 ? (
            <p className="text-sm text-muted-foreground">
              Δεν υπάρχουν καταγραφές παρουσίας ακόμα.
            </p>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="flex-1 space-y-1">
                  <p className="text-sm font-medium">Ποσοστό παρουσίας</p>
                  <p className="text-3xl font-bold">{attendanceRate}%</p>
                </div>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-2xl font-bold text-green-600">
                      {attendanceStats.present}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {ATTENDANCE_STATUS_LABELS_EL.present}
                    </p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-yellow-600">
                      {attendanceStats.late}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {ATTENDANCE_STATUS_LABELS_EL.late}
                    </p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-red-600">
                      {attendanceStats.absent}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {ATTENDANCE_STATUS_LABELS_EL.absent}
                    </p>
                  </div>
                </div>
              </div>

              {/* Recent Attendance */}
              {props.attendance.length > 0 && (
                <div className="border-t pt-4">
                  <p className="text-sm font-medium mb-3">
                    Πρόσφατες καταγραφές
                  </p>
                  <div className="space-y-2">
                    {props.attendance.slice(0, 10).map((record, idx) => {
                      const classInfo = props.classes.find(
                        (c) => c.id === record.class_id,
                      );
                      return (
                        <div
                          key={idx}
                          className="flex items-center justify-between rounded-md border bg-muted/50 px-3 py-2"
                        >
                          <div>
                            <p className="text-sm font-medium">
                              {classInfo?.name || "Άγνωστη τάξη"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {format(
                                new Date(record.attendance_date),
                                "d MMMM yyyy",
                                { locale: el },
                              )}
                            </p>
                          </div>
                          <Badge
                            variant={
                              record.status === "present"
                                ? "default"
                                : record.status === "late"
                                  ? "secondary"
                                  : "destructive"
                            }
                          >
                            {ATTENDANCE_STATUS_LABELS_EL[record.status] ??
                              record.status}
                          </Badge>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <StudentQuizPanel quizzes={props.quizzes} />
    </div>
  );
}

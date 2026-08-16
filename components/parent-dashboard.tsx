"use client";

import * as React from "react";
import { format } from "date-fns";
import { el } from "date-fns/locale";
import {
  Calendar,
  ClipboardList,
  GraduationCap,
  Users,
  ClockIcon,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MathText } from "@/components/math-text";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import type { ParentDashboardChild } from "@/lib/types/database";
import {
  ATTENDANCE_STATUS_LABELS_EL,
  DAY_LABELS_EL,
  TUITION_STATUS_LABELS_EL,
} from "@/lib/greek-labels";

type ParentDashboardProps = {
  parent: {
    id: string;
    name: string | null;
    email: string | null;
    phone: string | null;
    isPrimary: boolean;
  };
  allParents: Array<{
    name: string | null;
    email: string | null;
    phone: string | null;
    is_primary: boolean;
  }>;
  // Named `kids`, not `children` - the latter is a reserved React prop
  // name (react/no-children-prop) and would collide when passed as a JSX
  // attribute.
  kids: ParentDashboardChild[];
};

const DAY_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function ChildSection({ student, classes, schedules, attendance, quizzes }: ParentDashboardChild) {
  const schedulesByClass = schedules.reduce(
    (acc, schedule) => {
      if (!acc[schedule.class_id]) {
        acc[schedule.class_id] = [];
      }
      acc[schedule.class_id].push(schedule);
      return acc;
    },
    {} as Record<string, typeof schedules>,
  );

  Object.keys(schedulesByClass).forEach((classId) => {
    schedulesByClass[classId].sort((a, b) => {
      const dayDiff = DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day);
      if (dayDiff !== 0) return dayDiff;
      return a.time.localeCompare(b.time);
    });
  });

  const attendanceStats = {
    present: attendance.filter((a) => a.status === "present").length,
    late: attendance.filter((a) => a.status === "late").length,
    absent: attendance.filter((a) => a.status === "absent").length,
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
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5" />
            Στοιχεία μαθητή
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <p className="text-sm font-medium">Όνομα μαθητή</p>
              <p className="text-sm text-muted-foreground">
                {student.firstName} {student.lastName}
              </p>
            </div>
            {student.gradeLevel && (
              <div>
                <p className="text-sm font-medium">Τάξη</p>
                <p className="text-sm text-muted-foreground">
                  {student.gradeLevel}
                </p>
              </div>
            )}
            {student.email && (
              <div>
                <p className="text-sm font-medium">Email μαθητή</p>
                <p className="text-sm text-muted-foreground">
                  {student.email}
                </p>
              </div>
            )}
            {student.tuitionStatus && (
              <div>
                <p className="text-sm font-medium">Κατάσταση διδάκτρων</p>
                <Badge
                  variant={
                    student.tuitionStatus === "current"
                      ? "default"
                      : student.tuitionStatus === "scholarship"
                        ? "secondary"
                        : "destructive"
                  }
                >
                  {TUITION_STATUS_LABELS_EL[student.tuitionStatus] ??
                    student.tuitionStatus}
                </Badge>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Τάξεις & Πρόγραμμα
          </CardTitle>
        </CardHeader>
        <CardContent>
          {classes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Δεν έχει εγγραφεί σε καμία τάξη ακόμα.
            </p>
          ) : (
            <div className="space-y-4">
              {classes.map((classItem) => (
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

              {attendance.length > 0 && (
                <div className="border-t pt-4">
                  <p className="text-sm font-medium mb-3">
                    Πρόσφατες καταγραφές
                  </p>
                  <div className="space-y-2">
                    {attendance.slice(0, 10).map((record, idx) => {
                      const classInfo = classes.find(
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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5" />
            Αποτελέσματα τεστ
          </CardTitle>
        </CardHeader>
        <CardContent>
          {quizzes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Δεν έχουν ανατεθεί τεστ ακόμα.
            </p>
          ) : (
            <div className="space-y-2">
              {quizzes.map((quiz) => (
                <div
                  key={quiz.id}
                  className="flex items-center justify-between rounded-md border bg-muted/50 px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-medium">
                      <MathText text={quiz.title} />
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {quiz.className}
                    </p>
                  </div>
                  {quiz.completed ? (
                    <Badge>
                      {quiz.score} / {quiz.maxScore}
                    </Badge>
                  ) : (
                    <Badge variant="outline">Δεν έχει γίνει ακόμα</Badge>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function ParentDashboard(props: ParentDashboardProps) {
  const router = useRouter();

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
  };

  return (
    <div className="flex w-full flex-col gap-8 p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <User className="h-4 w-4" />
            Πίνακας γονέα
          </div>
          <h1 className="text-2xl font-semibold">
            Καλωσήρθατε, {props.parent.name}!
          </h1>
          <p className="text-sm text-muted-foreground">
            {props.kids.length > 1
              ? "Τάξεις, πρόγραμμα και παρουσίες των παιδιών σας"
              : `Τάξεις, πρόγραμμα και παρουσίες: ${props.kids[0]?.student.firstName ?? "το παιδί σας"}`}
          </p>
        </div>
        <Button onClick={handleSignOut} variant="outline">
          Αποσύνδεση
        </Button>
      </div>

      {props.allParents.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Άλλος γονέας/κηδεμόνας
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-2">
              {props.allParents
                .filter((p) => p.email !== props.parent.email)
                .map((otherParent, idx) => (
                  <div
                    key={idx}
                    className="rounded-md border bg-muted/50 p-3 space-y-1"
                  >
                    {otherParent.name && (
                      <p className="text-sm font-medium">{otherParent.name}</p>
                    )}
                    {otherParent.email && (
                      <p className="text-xs text-muted-foreground">
                        {otherParent.email}
                      </p>
                    )}
                    {otherParent.phone && (
                      <p className="text-xs text-muted-foreground">
                        {otherParent.phone}
                      </p>
                    )}
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {props.kids.map((child) => (
        <div key={child.student.id} className="space-y-4 rounded-xl border p-4">
          <h2 className="text-lg font-semibold">
            {child.student.firstName} {child.student.lastName}
          </h2>
          <ChildSection {...child} />
        </div>
      ))}
    </div>
  );
}

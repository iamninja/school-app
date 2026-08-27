"use client";

import * as React from "react";
import { format } from "date-fns";
import { el } from "date-fns/locale";
import {
  CalendarDays,
  ClipboardCheck,
  ClockIcon,
  EuroIcon,
  FileTextIcon,
  PenLine,
  PrinterIcon,
  UsersRound,
  XIcon,
} from "lucide-react";

import {
  AttendanceChip,
  PortalShell,
  SectionLabel,
  StatTile,
} from "@/components/portal-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MathText } from "@/components/math-text";
import { PortalHistoryDialog } from "@/components/portal-history-dialog";
import { PortalUpcomingCard } from "@/components/portal-upcoming-card";
import { ReceiptDocument } from "@/components/receipt-document";
import type {
  ParentDashboardChild,
  ParentDashboardData,
  QuizSummary,
  Receipt,
} from "@/lib/types/database";
import { formatEuro } from "@/lib/format-currency";
import {
  ATTENDANCE_STATUS_LABELS_EL,
  BALANCE_TRANSACTION_TYPE_LABELS_EL,
  DAY_LABELS_EL,
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
  balance: ParentDashboardData["balance"];
  receipts: ParentDashboardData["receipts"];
  business: ParentDashboardData["business"];
  demoMode?: boolean;
};

const DAY_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const RECENT_PREVIEW_COUNT = 5;

function QuizRow({ quiz }: { quiz: QuizSummary }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-background/60 px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">
          <MathText text={quiz.title} />
        </p>
        <p className="text-xs text-muted-foreground">
          {quiz.className ||
            (quiz.submittedAt
              ? format(new Date(quiz.submittedAt), "d MMMM yyyy", {
                  locale: el,
                })
              : "")}
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
  );
}

function TransactionRow({
  txn,
  receipt,
  onViewReceipt,
}: {
  txn: ParentDashboardData["balance"]["recentTransactions"][number];
  receipt: Receipt | undefined;
  onViewReceipt: (receipt: Receipt) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <div className="min-w-0">
        <p className="font-medium">{txn.description}</p>
        <p className="text-xs text-muted-foreground">
          {format(new Date(txn.createdAt), "d MMM yyyy", { locale: el })}
          {" · "}
          {BALANCE_TRANSACTION_TYPE_LABELS_EL[txn.type] ?? txn.type}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {receipt ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label={`Απόδειξη ${receipt.series}-${receipt.receipt_number}`}
            onClick={() => onViewReceipt(receipt)}
          >
            <FileTextIcon className="size-4" aria-hidden="true" />
          </Button>
        ) : null}
        <span
          className={
            txn.amount > 0
              ? "text-destructive"
              : "text-emerald-600 dark:text-emerald-400"
          }
        >
          {formatEuro(txn.amount)}
        </span>
      </div>
    </div>
  );
}

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
          {format(new Date(record.attendance_date), "d MMMM yyyy", {
            locale: el,
          })}
        </p>
      </div>
      <AttendanceChip
        status={record.status}
        label={ATTENDANCE_STATUS_LABELS_EL[record.status] ?? record.status}
      />
    </div>
  );
}

function ChildSection({
  student,
  classes,
  schedules,
  attendance,
  quizzes,
  calendarEvents,
}: ParentDashboardChild) {
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

  const initials = `${student.firstName?.[0] ?? ""}${
    student.lastName?.[0] ?? ""
  }`;

  return (
    <section className="space-y-6">
      {/* Child header */}
      <div className="flex flex-wrap items-center gap-4">
        <span
          className="flex size-12 items-center justify-center rounded-full bg-brand/20 text-base font-bold text-foreground"
          aria-hidden="true"
        >
          {initials}
        </span>
        <div className="flex-1">
          <h2 className="text-xl font-bold tracking-tight">
            {student.firstName} {student.lastName}
          </h2>
          <p className="text-sm text-muted-foreground">
            {[
              student.gradeLevel ? `Τάξη: ${student.gradeLevel}` : null,
              student.email,
            ]
              .filter(Boolean)
              .join(" · ") || "Μαθητής/-τρια του φροντιστηρίου"}
          </p>
        </div>
      </div>

      {/* Attendance stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile
          label="Ποσοστό παρουσιών"
          value={totalRecords > 0 ? `${attendanceRate}%` : "—"}
          tone="brand"
        />
        <StatTile
          label={ATTENDANCE_STATUS_LABELS_EL.present}
          value={attendanceStats.present}
          tone="positive"
        />
        <StatTile
          label={ATTENDANCE_STATUS_LABELS_EL.late}
          value={attendanceStats.late}
          tone="warning"
        />
        <StatTile
          label={ATTENDANCE_STATUS_LABELS_EL.absent}
          value={attendanceStats.absent}
          tone="negative"
        />
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[1.4fr_1fr]">
        {/* Left: classes + quizzes */}
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarDays className="size-4 text-brand" aria-hidden="true" />
                Τμήματα & Πρόγραμμα
              </CardTitle>
            </CardHeader>
            <CardContent>
              {classes.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Δεν έχει εγγραφεί σε κανένα τμήμα ακόμα.
                </p>
              ) : (
                <div className="space-y-3">
                  {classes.map((classItem) => (
                    <div
                      key={classItem.id}
                      className="space-y-3 rounded-xl border border-border/80 bg-background/60 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
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
                                {DAY_LABELS_EL[schedule.day] ?? schedule.day}{" "}
                                στις {schedule.time}
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

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <CardTitle className="flex items-center gap-2 text-base">
                <PenLine className="size-4 text-brand" aria-hidden="true" />
                Αποτελέσματα διαγωνισμάτων
              </CardTitle>
              {quizzes.length > RECENT_PREVIEW_COUNT ? (
                <PortalHistoryDialog
                  triggerLabel="Ιστορικό"
                  title="Αποτελέσματα διαγωνισμάτων"
                >
                  {quizzes.map((quiz) => (
                    <QuizRow key={quiz.id} quiz={quiz} />
                  ))}
                </PortalHistoryDialog>
              ) : null}
            </CardHeader>
            <CardContent>
              {quizzes.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Δεν έχουν ανατεθεί διαγωνίσματα ακόμα.
                </p>
              ) : (
                <div className="space-y-2">
                  {quizzes.slice(0, RECENT_PREVIEW_COUNT).map((quiz) => (
                    <QuizRow key={quiz.id} quiz={quiz} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: upcoming + recent attendance */}
        <div className="flex flex-col gap-6">
        <PortalUpcomingCard
          classes={classes}
          schedules={schedules}
          calendarEvents={calendarEvents}
        />
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <ClipboardCheck className="size-4 text-brand" aria-hidden="true" />
              Πρόσφατες παρουσίες
            </CardTitle>
            {attendance.length > RECENT_PREVIEW_COUNT ? (
              <PortalHistoryDialog triggerLabel="Ιστορικό" title="Παρουσίες">
                {attendance.map((record, idx) => (
                  <AttendanceRow
                    key={idx}
                    record={record}
                    classes={classes}
                  />
                ))}
              </PortalHistoryDialog>
            ) : null}
          </CardHeader>
          <CardContent>
            {attendance.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Δεν υπάρχουν καταγραφές παρουσίας ακόμα.
              </p>
            ) : (
              <div className="space-y-2">
                {attendance
                  .slice(0, RECENT_PREVIEW_COUNT)
                  .map((record, idx) => (
                    <AttendanceRow
                      key={idx}
                      record={record}
                      classes={classes}
                    />
                  ))}
              </div>
            )}
          </CardContent>
        </Card>
        </div>
      </div>
    </section>
  );
}

export function ParentDashboard(props: ParentDashboardProps) {
  const otherParents = props.allParents.filter(
    (p) => p.email !== props.parent.email,
  );
  const parentFirstName = props.parent.name?.trim().split(/\s+/)[0] ?? null;

  const [isHistoryOpen, setIsHistoryOpen] = React.useState(false);
  const [viewingReceipt, setViewingReceipt] = React.useState<Receipt | null>(
    null,
  );
  const receiptsById = new Map(props.receipts.map((r) => [r.id, r]));

  return (
    <PortalShell roleLabel="Πύλη γονέα" demoMode={props.demoMode}>
      <div className="flex w-full flex-col gap-10">
        {/* Greeting */}
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            {format(new Date(), "EEEE d MMMM yyyy", { locale: el })}
          </p>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Καλωσήρθατε, {parentFirstName}
            <span className="text-brand">.</span>
          </h1>
          <p className="text-muted-foreground">
            {props.kids.length > 1
              ? "Τμήματα, πρόγραμμα και παρουσίες των παιδιών σας, με μια ματιά."
              : `Τμήματα, πρόγραμμα και παρουσίες: ${props.kids[0]?.student.firstName ?? "το παιδί σας"}.`}
          </p>
        </div>

        <div className="space-y-3">
          <SectionLabel>Λογαριασμός</SectionLabel>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <CardTitle className="flex items-center gap-2 text-base">
                <EuroIcon className="size-4 text-brand" aria-hidden="true" />
                Υπόλοιπο διδάκτρων
              </CardTitle>
              {props.balance.recentTransactions.length > RECENT_PREVIEW_COUNT ||
              props.receipts.length > 0 ? (
                <PortalHistoryDialog
                  triggerLabel="Ιστορικό πληρωμών"
                  title={
                    viewingReceipt
                      ? `Απόδειξη ${viewingReceipt.series}-${viewingReceipt.receipt_number}`
                      : "Ιστορικό πληρωμών"
                  }
                  open={isHistoryOpen}
                  onOpenChange={(open) => {
                    setIsHistoryOpen(open);
                    if (!open) {
                      setViewingReceipt(null);
                    }
                  }}
                >
                  {viewingReceipt ? (
                    <div className="space-y-4">
                      <div className="flex flex-wrap items-center gap-2 print:hidden">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setViewingReceipt(null)}
                        >
                          <XIcon className="mr-1 h-3.5 w-3.5" /> Πίσω στο
                          ιστορικό
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => window.print()}
                        >
                          <PrinterIcon className="mr-1 h-3.5 w-3.5" />{" "}
                          Εκτύπωση / Αποθήκευση ως PDF
                        </Button>
                      </div>
                      <ReceiptDocument
                        receipt={viewingReceipt}
                        business={props.business}
                        isDemo={props.demoMode}
                      />
                    </div>
                  ) : (
                    props.balance.recentTransactions.map((txn) => (
                      <TransactionRow
                        key={txn.id}
                        txn={txn}
                        receipt={
                          txn.receiptId
                            ? receiptsById.get(txn.receiptId)
                            : undefined
                        }
                        onViewReceipt={setViewingReceipt}
                      />
                    ))
                  )}
                </PortalHistoryDialog>
              ) : null}
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p
                  className={`text-2xl font-bold ${
                    props.balance.amount > 0
                      ? "text-destructive"
                      : props.balance.amount < 0
                        ? "text-emerald-600 dark:text-emerald-400"
                        : ""
                  }`}
                >
                  {formatEuro(Math.abs(props.balance.amount))}
                </p>
                <p className="text-sm text-muted-foreground">
                  {props.balance.amount > 0
                    ? "Οφειλή"
                    : props.balance.amount < 0
                      ? "Πίστωση"
                      : "Εξοφλημένο"}
                  {props.balance.monthlyAmount > 0 &&
                    ` · ${formatEuro(props.balance.monthlyAmount)}/μήνα`}
                </p>
              </div>
              {props.balance.recentTransactions.length > 0 && (
                <div className="space-y-2 border-t border-border/70 pt-3">
                  {props.balance.recentTransactions
                    .slice(0, RECENT_PREVIEW_COUNT)
                    .map((txn) => (
                      <TransactionRow
                        key={txn.id}
                        txn={txn}
                        receipt={
                          txn.receiptId
                            ? receiptsById.get(txn.receiptId)
                            : undefined
                        }
                        onViewReceipt={(receipt) => {
                          setViewingReceipt(receipt);
                          setIsHistoryOpen(true);
                        }}
                      />
                    ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {otherParents.length > 0 && (
          <div className="space-y-3">
            <SectionLabel>Οικογένεια</SectionLabel>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <UsersRound className="size-4 text-brand" aria-hidden="true" />
                  Άλλος γονέας/κηδεμόνας
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 md:grid-cols-2">
                  {otherParents.map((otherParent, idx) => (
                    <div
                      key={idx}
                      className="space-y-0.5 rounded-lg border border-border/70 bg-background/60 p-3"
                    >
                      {otherParent.name && (
                        <p className="text-sm font-medium">
                          {otherParent.name}
                        </p>
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
          </div>
        )}

        {props.kids.length > 1 ? (
          <div className="space-y-3">
            <SectionLabel>Τα παιδιά σας</SectionLabel>
            <Tabs defaultValue={props.kids[0].student.id}>
              <TabsList>
                {props.kids.map((child) => (
                  <TabsTrigger key={child.student.id} value={child.student.id}>
                    {child.student.firstName}
                  </TabsTrigger>
                ))}
              </TabsList>
              {props.kids.map((child) => (
                <TabsContent
                  key={child.student.id}
                  value={child.student.id}
                  className="mt-4"
                >
                  <ChildSection {...child} />
                </TabsContent>
              ))}
            </Tabs>
          </div>
        ) : props.kids.length === 1 ? (
          <div className="space-y-3">
            <SectionLabel>Το παιδί σας</SectionLabel>
            <ChildSection {...props.kids[0]} />
          </div>
        ) : null}
      </div>
    </PortalShell>
  );
}

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabaseClient } from "./support/mock-supabase";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
  createServiceRoleClient: vi.fn(),
}));
vi.mock("@/lib/auth/require-teacher", () => ({ requireTeacher: vi.fn() }));
vi.mock("@/lib/push/hooks", () => ({
  notifyAfterResponse: vi.fn(),
  notifyClassesAfterResponse: vi.fn(),
  runAfterResponse: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { notifyAfterResponse, notifyClassesAfterResponse } from "@/lib/push/hooks";
import { createHomeworkAction } from "@/app/protected/teacher/homework-actions";
import { assignQuizToClassAction } from "@/app/protected/teacher/quiz-actions";
import {
  editAssessmentAssignmentScheduleAction,
  enterAssessmentMarkAction,
} from "@/app/protected/teacher/assessments-actions";
import {
  createCalendarEventAction,
  deleteCalendarEventAction,
  rescheduleClassOccurrenceAction,
} from "@/app/protected/teacher/calendar-actions";

const FUTURE = "2099-03-02";
const PAST = "2020-03-02";

function useClient(tables: Parameters<typeof createMockSupabaseClient>[0]) {
  const client = createMockSupabaseClient(tables);
  vi.mocked(createClient).mockResolvedValue(client as never);
  return client;
}

beforeEach(() => vi.clearAllMocks());

describe("new homework", () => {
  it("notifies the class with the note and due date", async () => {
    useClient({
      classes: { data: { id: "c1", name: "Β1" }, error: null },
      homework: { data: { id: "h1", class_id: "c1", note: "σελ. 42", due_date: "2099-03-05" }, error: null },
    });
    await createHomeworkAction({ classId: "c1", note: "σελ. 42", dueDate: "2099-03-05" });
    expect(notifyAfterResponse).toHaveBeenCalledWith({
      event: "homework",
      to: { kind: "class_students", classId: "c1" },
      classId: "c1",
      values: { class: "Β1", note: "σελ. 42", due_date: "5/3" },
      tag: "homework-h1",
      triggeredBy: "teacher-1",
    });
  });

  it("stays quiet when the 'notify' box is unticked", async () => {
    useClient({
      classes: { data: { id: "c1", name: "Β1" }, error: null },
      homework: { data: { id: "h1" }, error: null },
    });
    await createHomeworkAction({ classId: "c1", note: "x", notify: false });
    expect(notifyAfterResponse).not.toHaveBeenCalled();
  });
});

describe("quiz assigned to a class", () => {
  it("notifies a newly assigned class", async () => {
    useClient({
      quizzes: { data: { id: "q1", title: "Παράγωγοι", notifications_disabled: false }, error: null },
      quiz_assignments: { data: [{ id: "qa1" }], error: null },
    });
    await assignQuizToClassAction("q1", "c1");
    expect(notifyClassesAfterResponse).toHaveBeenCalledWith(["c1"], {
      event: "quiz",
      values: { title: "Παράγωγοι" },
      tag: "quiz-q1",
      triggeredBy: "teacher-1",
    });
  });

  it("doesn't re-notify a class that already had it", async () => {
    useClient({
      quizzes: { data: { id: "q1", title: "Π", notifications_disabled: false }, error: null },
      quiz_assignments: { data: [], error: null },
    });
    await assignQuizToClassAction("q1", "c1");
    expect(notifyClassesAfterResponse).not.toHaveBeenCalled();
  });

  it("respects the quiz's «Χωρίς ειδοποιήσεις» flag", async () => {
    useClient({
      quizzes: { data: { id: "q1", title: "Π", notifications_disabled: true }, error: null },
      quiz_assignments: { data: [{ id: "qa1" }], error: null },
    });
    await assignQuizToClassAction("q1", "c1");
    expect(notifyClassesAfterResponse).not.toHaveBeenCalled();
  });
});

describe("test marks", () => {
  const assignment = (status: string, disabled = false) => ({
    data: {
      id: "aa1",
      status,
      student_id: "s1",
      taken_at: "2099-01-01T10:00:00Z",
      assessment_id: "a1",
      assessments: { max_score: 20, title: "Όρια", notifications_disabled: disabled },
    },
    error: null,
  });
  const updated = { data: { id: "aa1", students: null }, error: null };

  it("notifies the student the first time a mark is entered", async () => {
    useClient({ assessment_assignments: [assignment("taken"), updated] });
    await enterAssessmentMarkAction("aa1", { score: 18 });
    expect(notifyAfterResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "mark_entered",
        to: { kind: "students", studentIds: ["s1"] },
        values: { title: "Όρια" },
      }),
    );
  });

  it("doesn't notify again when a mark is corrected", async () => {
    useClient({ assessment_assignments: [assignment("marked"), updated] });
    await enterAssessmentMarkAction("aa1", { score: 17 });
    expect(notifyAfterResponse).not.toHaveBeenCalled();
  });

  it("doesn't notify for a test flagged «Χωρίς ειδοποιήσεις», or with the box unticked", async () => {
    useClient({ assessment_assignments: [assignment("taken", true), updated] });
    await enterAssessmentMarkAction("aa1", { score: 18 });
    useClient({ assessment_assignments: [assignment("taken"), updated] });
    await enterAssessmentMarkAction("aa1", { score: 18, notify: false });
    expect(notifyAfterResponse).not.toHaveBeenCalled();
  });
});

describe("test date moved for one student", () => {
  const existing = {
    data: {
      id: "aa1",
      kind: "mock_exam",
      student_id: "s1",
      effective_scheduled_date: FUTURE,
      effective_scheduled_time: "10:00",
      effective_deadline_at: null,
      assessments: { title: "Όρια", notifications_disabled: false },
    },
    error: null,
  };

  it("tells the student the new date, and re-arms the reminder", async () => {
    const client = useClient({ assessment_assignments: [existing, { data: { id: "aa1" }, error: null }] });
    await editAssessmentAssignmentScheduleAction("aa1", { scheduledDate: "2099-03-09", scheduledTime: "11:00" });
    expect(notifyAfterResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "assessment_moved",
        values: { title: "Όρια", new_date: "9/3", new_time: "11:00" },
      }),
    );
    expect(client.from.mock.results[1].value.update).toHaveBeenCalledWith(
      expect.objectContaining({ reminder_sent_at: null }),
    );
  });

  it("says nothing when the new date is already in the past", async () => {
    useClient({ assessment_assignments: [existing, { data: { id: "aa1" }, error: null }] });
    await editAssessmentAssignmentScheduleAction("aa1", { scheduledDate: PAST, scheduledTime: "11:00" });
    expect(notifyAfterResponse).not.toHaveBeenCalled();
  });
});

describe("lesson changes", () => {
  const classRow = { data: { id: "c1", name: "Β1", archived_at: null }, error: null };
  const event = (type: string, date: string, time: string | null) => ({
    data: {
      id: `e-${type}`,
      event_type: type,
      event_date: date,
      start_time: time,
      class_id: "c1",
      class_name: "Β1",
      student_id: null,
    },
    error: null,
  });

  it("a cancellation from today on tells the class", async () => {
    useClient({ classes: classRow, calendar_events: event("cancellation", FUTURE, "17:00") });
    await createCalendarEventAction({ eventType: "cancellation", eventDate: FUTURE, startTime: "17:00", classId: "c1" });
    expect(notifyAfterResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "lesson_cancelled",
        to: { kind: "class_students", classId: "c1" },
        values: { class: "Β1", date: "2/3", time: "17:00" },
      }),
    );
  });

  it("editing the past sends nothing", async () => {
    useClient({ classes: classRow, calendar_events: event("cancellation", PAST, "17:00") });
    await createCalendarEventAction({ eventType: "cancellation", eventDate: PAST, startTime: "17:00", classId: "c1" });
    expect(notifyAfterResponse).not.toHaveBeenCalled();
  });

  it("removing a cancellation means the lesson is back on", async () => {
    useClient({ calendar_events: [event("cancellation", FUTURE, "17:00"), { data: null, error: null }] });
    await deleteCalendarEventAction("e-cancellation");
    expect(notifyAfterResponse).toHaveBeenCalledWith(
      expect.objectContaining({ event: "lesson_restored" }),
    );
  });

  it("moving a lesson sends one 'moved' notice, not a cancellation plus an extra lesson", async () => {
    useClient({
      classes: classRow,
      calendar_events: [event("extra_session", "2099-03-04", "18:00"), event("cancellation", FUTURE, "17:00")],
    });
    await rescheduleClassOccurrenceAction({
      classId: "c1",
      fromDate: FUTURE,
      fromStartTime: "17:00",
      toDate: "2099-03-04",
      toStartTime: "18:00",
    });
    expect(notifyAfterResponse).toHaveBeenCalledTimes(1);
    expect(notifyAfterResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "lesson_moved",
        values: { class: "Β1", date: "2/3", time: "17:00", new_date: "4/3", new_time: "18:00" },
      }),
    );
  });

  it("trial lessons and personal blocks never notify students", async () => {
    useClient({ calendar_events: { data: { event_type: "block", event_date: FUTURE, start_time: null, class_id: null, class_name: null, student_id: null }, error: null } });
    await createCalendarEventAction({ eventType: "block", eventDate: FUTURE, title: "Γιατρός" });
    expect(notifyAfterResponse).not.toHaveBeenCalled();
  });
});

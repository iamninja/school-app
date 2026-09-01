import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { addDays, format } from "date-fns";
import { ParentDashboard } from "@/components/parent-dashboard";
import type {
  ParentDashboardChild,
  ParentDashboardData,
  Receipt,
} from "@/lib/types/database";

function makeReceipt(overrides: Partial<Receipt> = {}): Receipt {
  return {
    id: "receipt-1",
    series: "Α",
    receipt_number: 1,
    issue_date: "2026-08-20",
    recipient_name: "Jane Doe",
    recipient_afm: null,
    recipient_address: null,
    family_id: "family-1",
    total_amount: 80,
    vat_category: "exempt_article_27",
    payment_method: 3,
    notes: null,
    mydata_status: "not_submitted",
    mydata_mark: null,
    mydata_uid: null,
    mydata_error: null,
    mydata_submitted_at: null,
    mydata_environment: null,
    mydata_last_verified_at: null,
    mydata_last_verified_ok: null,
    mydata_warning: null,
    emailed_at: null,
    created_at: "2026-08-20T10:00:00Z",
    counts_toward_balance: true,
    lineItems: [],
    ...overrides,
  };
}

const signOut = vi.fn();
const push = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { signOut },
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

function makeChild(overrides: Partial<ParentDashboardChild> = {}): ParentDashboardChild {
  return {
    student: {
      id: "student-1",
      firstName: "John",
      lastName: "Smith",
      gradeLevel: "8th",
      email: "john@example.com",
      tuitionAmount: 500,
      withdrawnAt: null,
    },
    classes: [],
    schedules: [],
    attendance: [],
    quizzes: [],
    calendarEvents: [],
    ...overrides,
  };
}

const baseProps = {
  parent: {
    id: "parent-1",
    name: "Jane Doe",
    email: "jane@example.com",
    phone: "555-1234",
    isPrimary: true,
  },
  allParents: [
    {
      name: "Jane Doe",
      email: "jane@example.com",
      phone: "555-1234",
      is_primary: true,
    },
  ],
  kids: [makeChild()],
  balance: {
    amount: 0,
    monthlyAmount: 500,
    recentTransactions: [] as ParentDashboardData["balance"]["recentTransactions"],
  },
  receipts: [] as ParentDashboardData["receipts"],
  business: null as ParentDashboardData["business"],
};

describe("ParentDashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the parent name and student information", () => {
    render(<ParentDashboard {...baseProps} />);

    expect(screen.getByText(/καλωσήρθατε, jane/i)).toBeInTheDocument();
    expect(screen.getAllByText("John Smith").length).toBeGreaterThan(0);
    expect(screen.getByText(/τάξη: 8th/i)).toBeInTheDocument();
    expect(screen.getByText(/εξοφλημένο/i)).toBeInTheDocument();
  });

  it("shows a message when the student has no classes", () => {
    render(<ParentDashboard {...baseProps} />);

    expect(
      screen.getByText(/δεν έχει εγγραφεί σε κανένα τμήμα/i),
    ).toBeInTheDocument();
  });

  it("lists classes with their schedule", () => {
    render(
      <ParentDashboard
        {...baseProps}
        kids={[
          makeChild({
            classes: [{ id: "class-1", name: "Algebra II", hoursPerWeek: 3, archivedAt: null }],
            schedules: [{ class_id: "class-1", day: "Mon", time: "10:00" }],
          }),
        ]}
      />,
    );

    // "Algebra II" now also appears in the new Upcoming card, so scope to
    // the Classes & Schedule card specifically.
    const classesCard = screen
      .getByText("Τμήματα & Πρόγραμμα")
      .closest(".rounded-2xl") as HTMLElement;
    expect(within(classesCard).getByText("Algebra II")).toBeInTheDocument();
    expect(
      within(classesCard).getByText(/3 ώρες\/εβδομάδα/i),
    ).toBeInTheDocument();
    expect(
      within(classesCard).getByText(/δευ στις 10:00/i),
    ).toBeInTheDocument();
  });

  it("shows an upcoming extra session with its Greek label", () => {
    render(
      <ParentDashboard
        {...baseProps}
        kids={[
          makeChild({
            classes: [
              { id: "class-1", name: "Algebra II", hoursPerWeek: 3, archivedAt: null },
            ],
            calendarEvents: [
              {
                id: "evt-1",
                event_type: "extra_session",
                event_date: format(addDays(new Date(), 3), "yyyy-MM-dd"),
                start_time: "17:00",
                end_time: null,
                class_id: "class-1",
                class_name: "Algebra II",
                notes: null,
              },
            ],
          }),
        ]}
      />,
    );

    const upcomingCard = screen
      .getByText("Επόμενα μαθήματα")
      .closest(".rounded-2xl") as HTMLElement;
    expect(
      within(upcomingCard).getByText("Έκτακτο μάθημα"),
    ).toBeInTheDocument();
  });

  it("shows a message when there are no attendance records", () => {
    render(<ParentDashboard {...baseProps} />);

    expect(
      screen.getByText(/δεν υπάρχουν καταγραφές παρουσίας/i),
    ).toBeInTheDocument();
  });

  it("falls back to the snapshotted class name for a deleted class's attendance record", () => {
    render(
      <ParentDashboard
        {...baseProps}
        kids={[
          makeChild({
            classes: [],
            attendance: [
              {
                class_id: null,
                class_name: "Old Trigonometry",
                attendance_date: "2026-01-05",
                status: "present",
              },
            ],
          }),
        ]}
      />,
    );

    expect(screen.getByText("Old Trigonometry")).toBeInTheDocument();
  });

  it("computes the attendance rate from present, late, and absent records", () => {
    render(
      <ParentDashboard
        {...baseProps}
        kids={[
          makeChild({
            classes: [{ id: "class-1", name: "Algebra II", hoursPerWeek: 3, archivedAt: null }],
            attendance: [
              { class_id: "class-1", class_name: "Algebra II", attendance_date: "2026-01-05", status: "present" },
              { class_id: "class-1", class_name: "Algebra II", attendance_date: "2026-01-06", status: "present" },
              { class_id: "class-1", class_name: "Algebra II", attendance_date: "2026-01-07", status: "late" },
              { class_id: "class-1", class_name: "Algebra II", attendance_date: "2026-01-08", status: "absent" },
            ],
          }),
        ]}
      />,
    );

    // 3 of 4 records count toward attendance (present + late), so rate = 75%
    expect(screen.getByText("75%")).toBeInTheDocument();
    expect(screen.getAllByText(/algebra ii/i).length).toBeGreaterThan(0);
  });

  it("shows other parent/guardian contact info when present", () => {
    render(
      <ParentDashboard
        {...baseProps}
        allParents={[
          ...baseProps.allParents,
          {
            name: "John Doe Sr.",
            email: "john.sr@example.com",
            phone: "555-5678",
            is_primary: false,
          },
        ]}
      />,
    );

    expect(screen.getByText("John Doe Sr.")).toBeInTheDocument();
    expect(screen.getByText("john.sr@example.com")).toBeInTheDocument();
  });

  it("signs the parent out and redirects home", async () => {
    const user = userEvent.setup();
    signOut.mockResolvedValue({ error: null });

    render(<ParentDashboard {...baseProps} />);

    await user.click(screen.getByRole("button", { name: /αποσύνδεση/i }));

    expect(signOut).toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith("/");
  });

  it("shows a message when there are no quizzes assigned", () => {
    render(<ParentDashboard {...baseProps} />);

    expect(
      screen.getByText(/δεν έχουν ανατεθεί διαγωνίσματα/i),
    ).toBeInTheDocument();
  });

  it("shows a deleted quiz's snapshotted title, date, and score", () => {
    render(
      <ParentDashboard
        {...baseProps}
        kids={[
          makeChild({
            quizzes: [
              {
                id: "attempt-1",
                title: "Old Chapter 2 Quiz",
                className: "",
                completed: true,
                score: 3,
                maxScore: 5,
                submittedAt: "2026-01-02T00:00:00Z",
                quizDeleted: true,
                bestScore: 3,
                attemptsUsed: 1,
                maxAttempts: null,
                canRetake: false,
              },
            ],
          }),
        ]}
      />,
    );

    expect(screen.getByText("Old Chapter 2 Quiz")).toBeInTheDocument();
    expect(screen.getByText(/βαθμός: 3 \/ 5/i)).toBeInTheDocument();
    expect(screen.getByText(/2 Ιανουαρίου 2026/i)).toBeInTheDocument();
  });

  it("lists quizzes with scores and a not-taken-yet state", () => {
    render(
      <ParentDashboard
        {...baseProps}
        kids={[
          makeChild({
            quizzes: [
              {
                id: "quiz-1",
                title: "Chapter 3 Quiz",
                className: "Algebra II",
                completed: true,
                score: 4,
                maxScore: 5,
                submittedAt: "2026-01-02T00:00:00Z",
                quizDeleted: false,
                bestScore: 4,
                attemptsUsed: 1,
                maxAttempts: null,
                canRetake: false,
              },
              {
                id: "quiz-2",
                title: "Pop Quiz",
                className: "Biology",
                completed: false,
                score: null,
                maxScore: 3,
                submittedAt: null,
                quizDeleted: false,
                bestScore: null,
                attemptsUsed: 0,
                maxAttempts: null,
                canRetake: false,
              },
            ],
          }),
        ]}
      />,
    );

    expect(screen.getByText("Chapter 3 Quiz")).toBeInTheDocument();
    expect(screen.getByText(/βαθμός: 4 \/ 5/i)).toBeInTheDocument();
    expect(screen.getByText("Pop Quiz")).toBeInTheDocument();
    expect(screen.getByText(/δεν έχει γίνει ακόμα/i)).toBeInTheDocument();
  });

  it("shows a separate best-attempt badge once a retry has beaten the official score", () => {
    render(
      <ParentDashboard
        {...baseProps}
        kids={[
          makeChild({
            quizzes: [
              {
                id: "quiz-1",
                title: "Chapter 3 Quiz",
                className: "Algebra II",
                completed: true,
                score: 3,
                maxScore: 5,
                submittedAt: "2026-01-02T00:00:00Z",
                quizDeleted: false,
                bestScore: 5,
                attemptsUsed: 2,
                maxAttempts: null,
                canRetake: true,
              },
            ],
          }),
        ]}
      />,
    );

    expect(screen.getByText(/βαθμός: 3 \/ 5/i)).toBeInTheDocument();
    expect(
      screen.getByText(/καλύτερη προσπάθεια: 5 \/ 5/i),
    ).toBeInTheDocument();
  });

  it("renders LaTeX in a quiz title", () => {
    const { container } = render(
      <ParentDashboard
        {...baseProps}
        kids={[
          makeChild({
            quizzes: [
              {
                id: "quiz-1",
                title: "Solving $x^2 = 4$",
                className: "Algebra II",
                completed: false,
                score: null,
                maxScore: 5,
                submittedAt: null,
                quizDeleted: false,
                bestScore: null,
                attemptsUsed: 0,
                maxAttempts: null,
                canRetake: false,
              },
            ],
          }),
        ]}
      />,
    );

    expect(container.querySelector(".katex")).not.toBeNull();
  });

  it("shows a comma-joined class list for a quiz assigned to more than one of the child's classes", () => {
    render(
      <ParentDashboard
        {...baseProps}
        kids={[
          makeChild({
            quizzes: [
              {
                id: "quiz-1",
                title: "Shared Quiz",
                className: "Algebra II, Geometry",
                completed: false,
                score: null,
                maxScore: 5,
                submittedAt: null,
                quizDeleted: false,
                bestScore: null,
                attemptsUsed: 0,
                maxAttempts: null,
                canRetake: false,
              },
            ],
          }),
        ]}
      />,
    );

    expect(screen.getByText("Shared Quiz")).toBeInTheDocument();
    expect(screen.getByText("Algebra II, Geometry")).toBeInTheDocument();
  });

  it("renders each child in a family in its own tab without leaking data between them", async () => {
    const user = userEvent.setup();
    render(
      <ParentDashboard
        {...baseProps}
        kids={[
          makeChild({
            student: {
              id: "student-1",
              firstName: "John",
              lastName: "Smith",
              gradeLevel: "8th",
              email: "john@example.com",
              tuitionAmount: 500,
              withdrawnAt: null,
            },
            classes: [{ id: "class-1", name: "Algebra II", hoursPerWeek: 3, archivedAt: null }],
            quizzes: [
              {
                id: "quiz-1",
                title: "John's Quiz",
                className: "Algebra II",
                completed: true,
                score: 5,
                maxScore: 5,
                submittedAt: "2026-01-02T00:00:00Z",
                quizDeleted: false,
                bestScore: 5,
                attemptsUsed: 1,
                maxAttempts: null,
                canRetake: false,
              },
            ],
          }),
          makeChild({
            student: {
              id: "student-2",
              firstName: "Emma",
              lastName: "Smith",
              gradeLevel: "5th",
              email: "emma@example.com",
              tuitionAmount: 400,
              withdrawnAt: null,
            },
            classes: [{ id: "class-2", name: "Biology", hoursPerWeek: 2, archivedAt: null }],
            quizzes: [
              {
                id: "quiz-2",
                title: "Emma's Quiz",
                className: "Biology",
                completed: false,
                score: null,
                maxScore: 3,
                submittedAt: null,
                quizDeleted: false,
                bestScore: null,
                attemptsUsed: 0,
                maxAttempts: null,
                canRetake: false,
              },
            ],
          }),
        ]}
      />,
    );

    // Multiple kids render as tabs - John's is active by default, Emma's
    // tab content isn't in the accessible tree until selected.
    expect(
      screen.getByRole("tab", { name: "John" }),
    ).toHaveAttribute("aria-selected", "true");
    expect(
      screen.getByRole("heading", { level: 2, name: "John Smith" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 3, name: "Algebra II" }),
    ).toBeInTheDocument();
    expect(screen.getByText("John's Quiz")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { level: 2, name: "Emma Smith" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Emma's Quiz")).not.toBeInTheDocument();

    // Switch to Emma's tab - her data should not leak from John's, and
    // vice versa once switched - the core regression risk of grouping
    // data per-child.
    await user.click(screen.getByRole("tab", { name: "Emma" }));

    expect(
      screen.getByRole("heading", { level: 2, name: "Emma Smith" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 3, name: "Biology" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Emma's Quiz")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { level: 2, name: "John Smith" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("John's Quiz")).not.toBeInTheDocument();
  });

  it("blends a not-counted receipt into the payment history without affecting the balance", () => {
    render(
      <ParentDashboard
        {...baseProps}
        balance={{ ...baseProps.balance, amount: 0, recentTransactions: [] }}
        receipts={[
          makeReceipt({
            id: "receipt-enrollment",
            counts_toward_balance: false,
            total_amount: 80,
          }),
        ]}
      />,
    );

    // Balance is unaffected - still "Εξοφλημένο" (paid in full), not showing
    // any debt from the not-counted receipt.
    expect(screen.getByText(/εξοφλημένο/i)).toBeInTheDocument();
    expect(screen.getByText("Απόδειξη Α1")).toBeInTheDocument();
    expect(screen.getByText(/δεν επηρεάζει το υπόλοιπο/i)).toBeInTheDocument();
  });

  it("still shows a normal (counted) receipt's linked transaction as before", () => {
    render(
      <ParentDashboard
        {...baseProps}
        balance={{
          ...baseProps.balance,
          amount: -80,
          recentTransactions: [
            {
              id: "txn-1",
              type: "receipt",
              amount: -80,
              description: "Απόδειξη Α1",
              createdAt: "2026-08-20T10:00:00Z",
              receiptId: "receipt-normal",
            },
          ],
        }}
        receipts={[makeReceipt({ id: "receipt-normal", total_amount: 80 })]}
      />,
    );

    expect(screen.getByText("Απόδειξη Α1")).toBeInTheDocument();
    expect(
      screen.queryByText(/δεν επηρεάζει το υπόλοιπο/i),
    ).not.toBeInTheDocument();
  });
});

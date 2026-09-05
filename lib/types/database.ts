/**
 * Database type definitions for the school management system
 * These types match the Supabase database schema
 */

// Base table types
export interface Family {
  id: string;
  teacher_id: string;
  deleted_at: string | null;
  created_at?: string;
}

export interface Student {
  id: string;
  first_name: string;
  last_name: string;
  grade_level: string | null;
  email: string | null;
  tuition_amount: number | null;
  tuition_status: string;
  user_id: string | null;
  teacher_id: string | null;
  family_id: string;
  withdrawn_at: string | null;
  created_at?: string;
}

// One row per parent PERSON per family (not per student-parent pairing) -
// replaces the old student_parents shape, which duplicated a parent's row
// per child and made a second child impossible under the unique email
// index.
export interface FamilyParent {
  id: string;
  family_id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  is_primary: boolean;
  user_id: string | null;
  created_at?: string;
}

// Lightweight summary for the teacher-side "existing family" picker.
export interface FamilySummary {
  id: string;
  parentNames: string[];
  parentEmails: string[];
  studentNames: string[];
}

export interface Class {
  id: string;
  name: string;
  hours_per_week: number;
  grade: string | null;
  teacher_id: string | null;
  archived_at: string | null;
  created_at?: string;
  start_date?: string | null;
  finish_date?: string | null;
}

export interface StudentClassAssignment {
  id: string;
  student_id: string;
  class_id: string;
  created_at?: string;
}

export interface ClassScheduleSlot {
  id: string;
  class_id: string;
  day: string;
  time: string;
  is_two_hour?: boolean;
  created_at?: string;
}

export interface AttendanceRecord {
  id: string;
  student_id: string;
  class_id: string | null;
  class_name: string;
  attendance_date: string;
  status: string;
  created_at?: string;
}

export interface Quiz {
  id: string;
  teacher_id: string;
  title: string;
  description: string | null;
  timeLimitMinutes: number | null;
  created_at?: string;
}

export interface QuizAssignment {
  id: string;
  quiz_id: string;
  class_id: string;
  assigned_at: string;
  shuffle_questions: boolean;
  // Number of attempts a student gets under this assignment; null = unlimited.
  max_attempts: number | null;
}

export type QuizQuestionType = "multiple_choice" | "true_false" | "short_answer";

export interface QuizQuestion {
  id: string;
  quiz_id: string;
  question_text: string;
  question_type: QuizQuestionType;
  order_index: number;
  points: number;
  image_path: string | null;
  created_at?: string;
}

export interface QuizQuestionOption {
  id: string;
  question_id: string;
  option_text: string;
  is_correct: boolean;
  order_index: number;
  created_at?: string;
}

export interface QuizAttempt {
  id: string;
  quiz_id: string;
  student_id: string;
  submitted_at: string;
  score: number;
}

export interface QuizAttemptAnswer {
  id: string;
  attempt_id: string;
  question_id: string;
  selected_option_id: string | null;
  text_answer: string | null;
  is_correct: boolean | null;
  points_awarded: number | null;
  created_at?: string;
}

// Join query result types
export interface StudentClassAssignmentWithClass extends StudentClassAssignment {
  classes: Class;
}

// Quiz-taking types: deliberately omit is_correct. These are what the
// student-facing "take this quiz" action returns - the answer key is
// never sent to the browser before submission.
export interface QuizQuestionOptionForTaking {
  id: string;
  optionText: string;
  orderIndex: number;
}

export interface QuizQuestionForTaking {
  id: string;
  questionText: string;
  questionType: QuizQuestionType;
  orderIndex: number;
  points: number;
  imageUrl: string | null;
  options: QuizQuestionOptionForTaking[];
}

export interface QuizForTaking {
  id: string;
  title: string;
  description: string | null;
  timeLimitMinutes: number | null;
  startedAt: string | null;
  questions: QuizQuestionForTaking[];
}

// Quiz submission input/output
export interface QuizAnswerInput {
  questionId: string;
  selectedOptionId?: string;
  textAnswer?: string;
}

export interface QuizAttemptAnswerReview {
  answerId: string;
  questionId: string;
  questionText: string;
  questionType: QuizQuestionType;
  imageUrl: string | null;
  selectedOptionId: string | null;
  selectedOptionText: string | null;
  textAnswer: string | null;
  correctOptionId: string | null;
  correctOptionText: string | null;
  isCorrect: boolean | null;
  pointsAwarded: number | null;
  pointsPossible: number;
  teacherComment: string | null;
  // Only ever set on the official (first-attempt) answer - a best-attempt
  // row from a retry never carries grading provenance. See the migration
  // comment in supabase/migrations/20260829095505_quiz-ai-grading.sql.
  // Optional (not just nullable) so existing fixtures/demo data that
  // predate AI grading don't all need updating - absent is equivalent to
  // null everywhere this is read.
  gradedBy?: "teacher" | "ai" | null;
  aiReasoning?: string | null;
  // Set on a wrong multiple_choice/true_false answer - why the correct
  // answer is correct. Purely informational (never affects scoring), so
  // unlike gradedBy/aiReasoning it's tracked on both the official and
  // best-attempt rows and shown to students, not just teachers.
  aiExplanation?: string | null;
}

// The current best-scoring attempt, once it has ever diverged from the
// official (first) one - i.e. present only once attemptsUsed > 1. Never
// itself a source of "how many tries are left" - see attemptsUsed/
// maxAttempts on the containing QuizAttemptReview for that.
export interface QuizAttemptBestSummary {
  score: number;
  submittedAt: string;
  answers: QuizAttemptAnswerReview[];
}

export interface QuizAttemptReview {
  attemptId: string;
  quizId: string;
  quizTitle: string;
  score: number;
  maxScore: number;
  submittedAt: string;
  answers: QuizAttemptAnswerReview[];
  attemptsUsed: number;
  // null = unlimited retakes for this student's assignment(s) of this quiz.
  maxAttempts: number | null;
  canRetake: boolean;
  // null when there's been no retry yet (best === official).
  best: QuizAttemptBestSummary | null;
}

// Quiz summary shown on student/parent dashboards - covers both
// not-yet-taken and completed quizzes. className is a comma-joined list
// when a quiz is assigned to more than one of the viewer's own classes.
export interface QuizSummary {
  id: string;
  title: string;
  className: string;
  completed: boolean;
  score: number | null;
  maxScore: number;
  submittedAt: string | null;
  // True only for a snapshot entry surfaced after the teacher deleted the
  // quiz - `id` is the attempt's own id in that case, not a real quiz id,
  // so there's nothing left to fetch a review/breakdown for.
  quizDeleted: boolean;
  // Retake tracking - null/0 until the quiz has been completed at least
  // once. bestScore only ever differs from score once a retry has beaten
  // the official attempt.
  bestScore: number | null;
  attemptsUsed: number;
  maxAttempts: number | null;
  canRetake: boolean;
}

// Teacher-side: authoring input
export interface QuizQuestionOptionInput {
  optionText: string;
  isCorrect: boolean;
}

export interface QuizQuestionInput {
  questionText: string;
  questionType: QuizQuestionType;
  points: number;
  options: QuizQuestionOptionInput[];
  // Storage object path, round-trips through create/update/duplicate.
  imagePath: string | null;
  // Signed URL for display only, populated by read actions - never written
  // back to the server (createQuizAction/updateQuizAction ignore it).
  imageUrl?: string | null;
  // Optional grading reference for short_answer questions only - used by
  // AI grading when present, ignored for other question types.
  modelAnswer?: string | null;
}

export interface CreateQuizInput {
  classIds?: string[];
  title: string;
  description?: string;
  timeLimitMinutes?: number;
  questions: QuizQuestionInput[];
}

// questions omitted means "don't touch questions" - the server rejects a
// present questions array once the quiz already has student attempts.
export interface UpdateQuizInput {
  quizId: string;
  title: string;
  description?: string;
  timeLimitMinutes?: number;
  questions?: QuizQuestionInput[];
}

export interface QuizForEditing {
  id: string;
  title: string;
  description: string | null;
  timeLimitMinutes: number | null;
  locked: boolean;
  assignedClassIds: string[];
  questions: QuizQuestionInput[];
}

export interface TeacherQuizListItem {
  id: string;
  assignedClasses: {
    id: string;
    name: string;
    shuffleQuestions: boolean;
    maxAttempts: number | null;
  }[];
  title: string;
  description: string | null;
  timeLimitMinutes: number | null;
  questionCount: number;
  hasAttempts: boolean;
  createdAt?: string;
}

// Teacher-side: per-quiz results
export interface QuizResultRow {
  studentId: string;
  studentName: string;
  completed: boolean;
  score: number | null;
  maxScore: number;
  submittedAt: string | null;
  pendingShortAnswerCount: number;
  // null/0 until completed; bestScore only differs from score once a
  // retry has beaten the student's official (first) attempt.
  bestScore: number | null;
  attemptsUsed: number;
}

export interface QuizResults {
  quizId: string;
  quizTitle: string;
  results: QuizResultRow[];
}

// Teacher-side: per-question breakdown across every student who has
// attempted the quiz - the complement to QuizResults, which is per-student
// across all questions.
export interface QuizQuestionOptionBreakdown {
  optionId: string;
  optionText: string;
  isCorrect: boolean;
  count: number;
}

export interface QuizQuestionStudentAnswer {
  answerId: string;
  studentId: string;
  studentName: string;
  selectedOptionText: string | null;
  textAnswer: string | null;
  isCorrect: boolean | null;
  teacherComment: string | null;
}

export interface QuizQuestionBreakdown {
  questionId: string;
  questionText: string;
  questionType: QuizQuestionType;
  points: number;
  imageUrl: string | null;
  optionBreakdown: QuizQuestionOptionBreakdown[];
  studentAnswers: QuizQuestionStudentAnswer[];
}

export interface QuizQuestionBreakdownResult {
  quizId: string;
  quizTitle: string;
  questions: QuizQuestionBreakdown[];
}

// A short-answer response awaiting manual grading, scoped to one class -
// spans every quiz assigned to that class, for the grading panel on the
// class-detail view.
export interface PendingGradingItem {
  answerId: string;
  quizId: string;
  quizTitle: string;
  questionId: string;
  questionText: string;
  points: number;
  studentId: string;
  studentName: string;
  textAnswer: string | null;
  teacherComment: string | null;
}

// Dashboard data types
export interface StudentDashboardData {
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
    is_two_hour?: boolean;
  }>;
  attendance: Array<{
    class_id: string | null;
    class_name: string;
    attendance_date: string;
    status: string;
  }>;
  quizzes: QuizSummary[];
  calendarEvents: PortalCalendarEvent[];
  assessments: AssessmentSummary[];
}

export interface ParentDashboardChild {
  student: {
    id: string;
    firstName: string;
    lastName: string;
    gradeLevel: string | null;
    email: string | null;
    tuitionAmount: number | null;
    withdrawnAt: string | null;
  };
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
    is_two_hour?: boolean;
  }>;
  attendance: Array<{
    class_id: string | null;
    class_name: string;
    attendance_date: string;
    status: string;
  }>;
  quizzes: QuizSummary[];
  calendarEvents: PortalCalendarEvent[];
  assessments: AssessmentSummary[];
}

export interface ParentDashboardData {
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
  // Named `kids`, not `children` - the latter is a reserved React prop name
  // and would collide when passed as a JSX attribute (<ParentDashboard
  // children={...} />) triggers react/no-children-prop).
  kids: ParentDashboardChild[];
  balance: {
    amount: number;
    monthlyAmount: number;
    recentTransactions: Array<{
      id: string;
      type: FamilyBalanceTransactionType;
      amount: number;
      description: string;
      createdAt: string;
      receiptId: string | null;
    }>;
  };
  // This family's receipts, for the tuition history dialog's "view
  // receipt" flow - receiptId above links a transaction to one of these.
  receipts: Receipt[];
  // Needed to render a receipt (name/ΑΦΜ/address on the header) via the
  // same ReceiptDocument the teacher console already uses.
  business: BusinessProfile | null;
}

// Action result types
export interface ActionSuccess<T = void> {
  success: true;
  data?: T;
}

export interface ActionError {
  success?: false;
  error: string;
}

export type ActionResult<T = void> = ActionSuccess<T> | ActionError;

// Auth check result types
export interface StudentEmailCheckSuccess {
  exists: true;
  studentId: string;
  firstName: string;
  lastName: string;
}

export interface StudentEmailCheckError {
  exists: false;
  error: string;
}

export type StudentEmailCheckResult =
  | StudentEmailCheckSuccess
  | StudentEmailCheckError;

export interface ParentEmailCheckSuccess {
  exists: true;
  parentId: string;
  parentName: string | null;
  familyId: string;
}

export interface ParentEmailCheckError {
  exists: false;
  error: string;
}

export type ParentEmailCheckResult =
  | ParentEmailCheckSuccess
  | ParentEmailCheckError;

// Business settings. Deliberately not per-teacher - there is one business,
// however many teacher accounts exist. Everything here is non-secret and
// gets printed on receipts; API credentials live in
// private.integration_credentials, never in these types.
export interface BusinessProfile {
  id: number;
  business_name: string | null;
  afm: string | null;
  doy: string | null;
  activity_code: string | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  phone: string | null;
  updated_at: string;
}

export interface BusinessProfileInput {
  businessName?: string;
  afm?: string;
  doy?: string;
  activityCode?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  phone?: string;
}

export interface IntegrationSettings {
  provider: string;
  active_environment: "sandbox" | "production";
  enabled: boolean;
  updated_at: string;
}

// Receipts (Αποδείξεις Παροχής Υπηρεσιών). Recipient fields are
// snapshotted at issue time, not joined - a receipt is a record of what
// was issued that day, and later edits to a family must not change it.
export type MyDataStatus = "not_submitted" | "submitted" | "failed";

export interface ReceiptLineItem {
  id: string;
  student_id: string | null;
  description: string;
  amount: number;
  order_index: number;
}

export interface Receipt {
  id: string;
  series: string;
  receipt_number: number;
  issue_date: string;
  recipient_name: string;
  recipient_afm: string | null;
  recipient_address: string | null;
  family_id: string | null;
  total_amount: number;
  vat_category: string;
  // AADE payment-method code (spec §8.12): 3 cash, 6 web banking,
  // 7 POS/e-POS, 8 IRIS. Mandatory in the myDATA payload for type 11.2.
  payment_method: number;
  notes: string | null;
  mydata_status: MyDataStatus;
  mydata_mark: string | null;
  mydata_uid: string | null;
  mydata_error: string | null;
  mydata_submitted_at: string | null;
  mydata_environment: "sandbox" | "production" | null;
  mydata_last_verified_at: string | null;
  mydata_last_verified_ok: boolean | null;
  // A code/message segment AADE returned alongside an accepted MARK - the
  // response can look like a clean success and still carry one.
  mydata_warning: string | null;
  emailed_at: string | null;
  created_at: string;
  // False for an enrollment/material fee or pre-existing debt - the receipt
  // still exists and still shows in the family's history, it just doesn't
  // post a credit to their running tuition balance (see
  // post_receipt_balance_row()).
  counts_toward_balance: boolean;
  lineItems: ReceiptLineItem[];
}

export interface ReceiptLineItemInput {
  studentId?: string | null;
  description: string;
  amount: number;
}

export interface CreateReceiptInput {
  issueDate?: string;
  paymentMethod?: number;
  recipientName: string;
  recipientAfm?: string;
  recipientAddress?: string;
  familyId?: string | null;
  notes?: string;
  countsTowardBalance?: boolean;
  lineItems: ReceiptLineItemInput[];
}

// Business expenses - internal bookkeeping, no myDATA transmission (see
// the migration comment for why: SendExpensesClassification classifies a
// document that already exists in myDATA, it doesn't create one).
export interface Expense {
  id: string;
  expense_date: string;
  supplier_name: string;
  supplier_afm: string | null;
  description: string;
  amount: number;
  vat_amount: number | null;
  category: string | null;
  payment_method: number | null;
  notes: string | null;
  created_at: string;
}

export interface ExpenseInput {
  expenseDate?: string;
  supplierName: string;
  supplierAfm?: string;
  description: string;
  amount: number;
  vatAmount?: number;
  category?: string;
  paymentMethod?: number;
  notes?: string;
}

// Calendar events - the override layer on top of the recurring
// class_schedule_slots template. class_id/student_id are ON DELETE SET
// NULL with class_name/student_name snapshotted at write time (see the
// migration comment for why the shape CHECK is written against the
// snapshot columns, not the FK columns).
export type CalendarEventType =
  | "cancellation"
  | "extra_session"
  | "ad_hoc_lesson"
  | "trial_lesson"
  | "block";

export interface CalendarEvent {
  id: string;
  event_type: CalendarEventType;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  class_id: string | null;
  class_name: string | null;
  student_id: string | null;
  student_name: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  title: string | null;
  notes: string | null;
  created_at: string;
}

// className/studentName are deliberately absent - the server action
// resolves those from a fresh classes/students lookup it already has to do
// for the ownership check, never from client input.
export interface CalendarEventInput {
  eventType: CalendarEventType;
  eventDate: string;
  startTime?: string | null;
  endTime?: string | null;
  classId?: string | null;
  studentId?: string | null;
  contactName?: string;
  contactPhone?: string;
  title?: string;
  notes?: string;
}

// The narrowed shape the parent/student portals receive - "block" and
// "trial_lesson" are structurally unreachable there (RLS), and the portals
// never need contact/title fields.
export interface PortalCalendarEvent {
  id: string;
  event_type: "cancellation" | "extra_session" | "ad_hoc_lesson";
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  class_id: string | null;
  class_name: string | null;
  notes: string | null;
}

// Assessments: in-person tests/mock exams, graded with one
// manually-entered mark. Named "assessments", not "tests" - avoids
// colliding with this repo's own unit-test vocabulary (tests/, `npm test`,
// vitest). Not built on the quizzes tables - see
// supabase/migrations/*_assessments.sql for why. `assessments` is the
// template; `assessment_assignments` is the per-student
// roster/schedule/grade row.
export type AssessmentKind = "short_assessment" | "mock_exam";
export type AssessmentAssignmentStatus = "registered" | "taken" | "marked";

export interface Assessment {
  id: string;
  kind: AssessmentKind;
  title: string;
  description: string | null;
  max_score: number;
  duration_minutes: number;
  scheduled_date: string | null;
  scheduled_time: string | null;
  deadline_at: string | null;
  class_id: string | null;
  class_name: string | null;
  // Same code list as classes.grade (lib/class-grades.ts) - a tag for
  // filtering, and (app-layer only) for suggesting which classes/students
  // to assign the assessment to. Not a foreign key - just a label.
  grade: string | null;
  created_at: string;
}

// class_name is server-resolved from a trusted classId fetch, never taken
// from client input - same convention as CalendarEventInput.
export interface AssessmentInput {
  kind: AssessmentKind;
  title: string;
  description?: string;
  maxScore: number;
  durationMinutes: number;
  scheduledDate?: string | null; // mock_exam
  scheduledTime?: string | null; // mock_exam
  deadlineAt?: string | null; // short_assessment, null/absent = open
  classId?: string | null; // exactly one of classId/studentIds on create
  studentIds?: string[];
  grade?: string | null;
}

export interface AssessmentAssignment {
  id: string;
  assessment_id: string;
  student_id: string;
  kind: AssessmentKind;
  effective_scheduled_date: string | null;
  effective_scheduled_time: string | null;
  effective_deadline_at: string | null;
  taken_at: string | null;
  status: AssessmentAssignmentStatus;
  score: number | null;
  teacher_comment: string | null;
  created_at: string;
}

// Shape of an assessment_assignments row embedded-joined to its parent
// assessments row - what the parent/student dashboard fetches (scoped by
// student_id) look like straight off the wire, before being mapped down
// to AssessmentSummary.
export interface AssessmentAssignmentWithAssessment extends AssessmentAssignment {
  assessments: Pick<Assessment, "title" | "max_score" | "class_id" | "class_name">;
}

// Teacher-side roster row: assignment + joined student display name +
// isLate computed server-side by lib/assessment-status.ts before
// returning, so every caller (teacher UI, calendar overlay, class/student
// detail) reads the same derivation.
export interface TeacherAssessmentAssignmentRow extends AssessmentAssignment {
  studentName: string;
  isLate: boolean;
}

export interface TeacherAssessmentListItem extends Assessment {
  assignmentCount: number;
  markedCount: number;
}

// Portal-facing summary shown on student/parent dashboards - shaped like
// QuizSummary above (same field-naming convention).
export interface AssessmentSummary {
  id: string; // assessment_assignments.id
  assessmentId: string;
  kind: AssessmentKind;
  title: string;
  className: string | null;
  maxScore: number;
  effectiveScheduledDate: string | null;
  effectiveScheduledTime: string | null;
  effectiveDeadlineAt: string | null;
  status: AssessmentAssignmentStatus;
  score: number | null;
  teacherComment: string | null;
  isLate: boolean;
}

// Monthly tuition balance ledger. amount is SIGNED: positive = family
// owes more, negative = owes less. See the family-balance-ledger
// migration for the full sign/shape CHECK constraints this mirrors.
export type FamilyBalanceTransactionType =
  | "monthly_charge"
  | "payment"
  | "receipt"
  | "prepayment"
  | "adjustment";

export interface FamilyBalanceTransaction {
  id: string;
  family_id: string;
  type: FamilyBalanceTransactionType;
  amount: number;
  period: string | null;
  period_end: string | null;
  covers_months: number | null;
  description: string;
  receipt_id: string | null;
  payment_method: number | null;
  source: "manual" | "cron" | "receipt";
  created_by: string | null;
  created_at: string;
}

export interface FamilyBalanceSummary {
  id: string;
  parentNames: string[];
  studentNames: string[];
  activeStudentCount: number;
  monthlyAmount: number;
  balance: number;
  balanceUpdatedAt: string | null;
}

export interface FamilyLedger {
  familyId: string;
  balance: number;
  monthlyAmount: number;
  transactions: Array<FamilyBalanceTransaction & { runningBalance: number }>;
}

// Carries a just-logged informal payment over to the Receipts tab so the
// teacher can optionally turn it into a real myDATA receipt without
// re-entering the family/amount/payment method.
export interface ReceiptPrefill {
  familyId: string;
  amount: number;
  paymentMethod: number;
}

export interface ChargeRun {
  id: string;
  period: string;
  ran_at: string;
  source: "cron" | "manual";
  billable: boolean;
  families_charged: number;
  total_amount: number;
  skipped_reason: "not_a_billable_month" | "no_families_with_charges" | null;
  error: string | null;
}

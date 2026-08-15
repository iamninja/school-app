/**
 * Database type definitions for the school management system
 * These types match the Supabase database schema
 */

// Base table types
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
  created_at?: string;
}

export interface StudentParent {
  id: string;
  student_id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  is_primary: boolean;
  user_id: string | null;
  created_at?: string;
}

export interface Class {
  id: string;
  name: string;
  hours_per_week: number;
  teacher_id: string | null;
  created_at?: string;
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
  created_at?: string;
}

export interface AttendanceRecord {
  id: string;
  student_id: string;
  class_id: string;
  attendance_date: string;
  status: string;
  created_at?: string;
}

export interface Quiz {
  id: string;
  teacher_id: string;
  title: string;
  description: string | null;
  created_at?: string;
}

export interface QuizAssignment {
  id: string;
  quiz_id: string;
  class_id: string;
  assigned_at: string;
}

export type QuizQuestionType = "multiple_choice" | "true_false" | "short_answer";

export interface QuizQuestion {
  id: string;
  quiz_id: string;
  question_text: string;
  question_type: QuizQuestionType;
  order_index: number;
  points: number;
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
  options: QuizQuestionOptionForTaking[];
}

export interface QuizForTaking {
  id: string;
  title: string;
  description: string | null;
  questions: QuizQuestionForTaking[];
}

// Quiz submission input/output
export interface QuizAnswerInput {
  questionId: string;
  selectedOptionId?: string;
  textAnswer?: string;
}

export interface QuizAttemptAnswerReview {
  questionId: string;
  questionText: string;
  questionType: QuizQuestionType;
  selectedOptionId: string | null;
  selectedOptionText: string | null;
  textAnswer: string | null;
  correctOptionId: string | null;
  correctOptionText: string | null;
  isCorrect: boolean | null;
  pointsAwarded: number | null;
  pointsPossible: number;
}

export interface QuizAttemptReview {
  attemptId: string;
  quizId: string;
  quizTitle: string;
  score: number;
  maxScore: number;
  submittedAt: string;
  answers: QuizAttemptAnswerReview[];
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
}

export interface CreateQuizInput {
  classIds?: string[];
  title: string;
  description?: string;
  questions: QuizQuestionInput[];
}

// questions omitted means "don't touch questions" - the server rejects a
// present questions array once the quiz already has student attempts.
export interface UpdateQuizInput {
  quizId: string;
  title: string;
  description?: string;
  questions?: QuizQuestionInput[];
}

export interface QuizForEditing {
  id: string;
  title: string;
  description: string | null;
  locked: boolean;
  assignedClassIds: string[];
  questions: QuizQuestionInput[];
}

export interface TeacherQuizListItem {
  id: string;
  assignedClasses: { id: string; name: string }[];
  title: string;
  description: string | null;
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
  studentId: string;
  studentName: string;
  selectedOptionText: string | null;
  textAnswer: string | null;
  isCorrect: boolean | null;
}

export interface QuizQuestionBreakdown {
  questionId: string;
  questionText: string;
  questionType: QuizQuestionType;
  points: number;
  optionBreakdown: QuizQuestionOptionBreakdown[];
  studentAnswers: QuizQuestionStudentAnswer[];
}

export interface QuizQuestionBreakdownResult {
  quizId: string;
  quizTitle: string;
  questions: QuizQuestionBreakdown[];
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
}

export interface ParentDashboardData {
  parent: {
    id: string;
    name: string | null;
    email: string | null;
    phone: string | null;
    isPrimary: boolean;
  };
  student: {
    id: string;
    firstName: string;
    lastName: string;
    gradeLevel: string | null;
    email: string | null;
    tuitionAmount: number | null;
    tuitionStatus: string;
  };
  allParents: Array<{
    name: string | null;
    email: string | null;
    phone: string | null;
    is_primary: boolean;
  }>;
  classes: Array<{
    id: string;
    name: string;
    hoursPerWeek: number;
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
  studentId: string;
}

export interface ParentEmailCheckError {
  exists: false;
  error: string;
}

export type ParentEmailCheckResult =
  | ParentEmailCheckSuccess
  | ParentEmailCheckError;

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

// Join query result types
export interface StudentClassAssignmentWithClass extends StudentClassAssignment {
  classes: Class;
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

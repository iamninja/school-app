import type { SupabaseClient } from "@supabase/supabase-js";
import type { NotificationSwitch } from "@/lib/push/messages";

/** The notification_settings row (see the push-notifications migration). */
export type NotificationSettings = Record<NotificationSwitch, boolean> & {
  parent_fallback: boolean;
  paused: boolean;
  quiet_hours_enabled: boolean;
  quiet_start: string;
  quiet_end: string;
  homework_reminder_time: string;
  absence_timing: "immediate" | "after_lesson";
  balance_reminder_day: number;
};

/** Same defaults as the migration, used if the row can't be read. */
export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  homework: true,
  homework_reminders: true,
  quizzes: true,
  quiz_reminders: true,
  assessments: true,
  test_reminders: true,
  lesson_changes: true,
  marks: true,
  absences: true,
  receipts: true,
  monthly_charges: false,
  balance_reminder: false,
  teacher_quiz_review: true,
  teacher_charge_failed: true,
  teacher_mydata_failed: true,
  teacher_attendance_missing: true,
  parent_fallback: true,
  paused: false,
  quiet_hours_enabled: false,
  quiet_start: "22:00",
  quiet_end: "08:00",
  homework_reminder_time: "20:00",
  absence_timing: "immediate",
  balance_reminder_day: 10,
};

export const SETTINGS_COLUMNS = Object.keys(DEFAULT_NOTIFICATION_SETTINGS).join(", ");

export async function loadNotificationSettings(
  supabase: SupabaseClient,
): Promise<NotificationSettings> {
  const { data } = await supabase
    .from("notification_settings")
    .select(SETTINGS_COLUMNS)
    .eq("id", 1)
    .maybeSingle();
  return { ...DEFAULT_NOTIFICATION_SETTINGS, ...((data ?? {}) as Partial<NotificationSettings>) };
}

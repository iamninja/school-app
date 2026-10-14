import { TEACHER_HOME } from "@/lib/auth/portal-home";

/**
 * Which teacher view to open: the phone companion (/teacher-app) or the full
 * console (/protected/teacher). Phones get the companion unless the teacher
 * picked the console from its menu; tablets and desktops always get the
 * console unless the teacher picked the companion from the console.
 */
export const TEACHER_APP_HOME = "/teacher-app";

export const TEACHER_VIEW_COOKIE = "modus-teacher-view";
export const TEACHER_VIEW_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export type TeacherView = "console" | "companion";

export function parseTeacherView(value: string | undefined | null): TeacherView | null {
  return value === "console" || value === "companion" ? value : null;
}

/** `deviceType` is `userAgent(request).device.type` (undefined on desktops). */
export function isPhone(deviceType: string | undefined): boolean {
  return deviceType === "mobile";
}

export function teacherHomeFor({
  isMobile,
  cookie,
}: {
  isMobile: boolean;
  cookie: string | undefined | null;
}): string {
  const choice = parseTeacherView(cookie);
  if (choice === "companion") return TEACHER_APP_HOME;
  if (choice === "console") return TEACHER_HOME;
  return isMobile ? TEACHER_APP_HOME : TEACHER_HOME;
}

import { NextResponse, type NextRequest } from "next/server";
import { TEACHER_HOME } from "@/lib/auth/portal-home";
import {
  parseTeacherView,
  TEACHER_APP_HOME,
  TEACHER_VIEW_COOKIE,
  TEACHER_VIEW_COOKIE_MAX_AGE,
} from "@/lib/teacher-app/view";

/**
 * "Full console" / "Phone view" links: remembers the teacher's choice in a
 * cookie, so /start and the console's phone redirect respect it from then on,
 * and opens that view. Only a view preference - every page behind it does
 * its own teacher check.
 */
export function GET(request: NextRequest) {
  const view = parseTeacherView(request.nextUrl.searchParams.get("to")) ?? "companion";
  const response = NextResponse.redirect(
    new URL(view === "console" ? TEACHER_HOME : TEACHER_APP_HOME, request.url),
  );
  response.cookies.set(TEACHER_VIEW_COOKIE, view, {
    path: "/",
    maxAge: TEACHER_VIEW_COOKIE_MAX_AGE,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
  });
  return response;
}

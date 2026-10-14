import { NextResponse, userAgent, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolvePortalHome, TEACHER_HOME } from "@/lib/auth/portal-home";
import {
  isPhone,
  teacherHomeFor,
  TEACHER_APP_HOME,
  TEACHER_VIEW_COOKIE,
} from "@/lib/teacher-app/view";

/**
 * The installed app's start page (manifest start_url). Sends whoever is
 * signed in straight to their own portal - teacher console, parent portal or
 * student portal - so the home-screen icon never opens the public landing
 * page for someone who is already logged in. Signed-out visitors never reach
 * this handler: the session proxy (lib/supabase/proxy.ts) redirects them to
 * "/", the login chooser, which is the right place for them.
 *
 * A teacher on a phone goes to the phone companion instead of the console,
 * unless they've switched to the console from its menu (lib/teacher-app/view.ts),
 * and lands straight on the lesson in progress if there is one.
 *
 * Not cached: route handlers aren't by default, and this one reads the
 * session cookie on every request.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let destination = await resolvePortalHome(supabase, user?.id);
  if (destination === TEACHER_HOME) {
    destination = teacherHomeFor({
      isMobile: isPhone(userAgent(request).device.type),
      cookie: request.cookies.get(TEACHER_VIEW_COOKIE)?.value,
    });
    // Opening the app: the companion jumps into a lesson in progress.
    if (destination === TEACHER_APP_HOME) destination = `${TEACHER_APP_HOME}?open=1`;
  }
  return NextResponse.redirect(new URL(destination, request.url));
}

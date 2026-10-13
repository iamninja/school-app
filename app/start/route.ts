import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolvePortalHome } from "@/lib/auth/portal-home";

/**
 * The installed app's start page (manifest start_url). Sends whoever is
 * signed in straight to their own portal - teacher console, parent portal or
 * student portal - so the home-screen icon never opens the public landing
 * page for someone who is already logged in. Signed-out visitors never reach
 * this handler: the session proxy (lib/supabase/proxy.ts) redirects them to
 * "/", the login chooser, which is the right place for them.
 *
 * Not cached: route handlers aren't by default, and this one reads the
 * session cookie on every request.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const destination = await resolvePortalHome(supabase, user?.id);
  return NextResponse.redirect(new URL(destination, request.url));
}

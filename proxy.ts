import { updateSession } from "@/lib/supabase/proxy";
import { type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - manifest.webmanifest, sw.js, offline.html - the installable app's
     *   files (app/manifest.ts, public/). Browsers fetch the manifest
     *   WITHOUT cookies and the service worker before anyone is signed in,
     *   so the session gate below would redirect them to "/" and the app
     *   could not be installed. None of them contains personal data.
     * - images - .svg, .png, .jpg, .jpeg, .gif, .webp (includes the app
     *   icons in public/icons/)
     * Feel free to modify this pattern to include more paths.
     */
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|offline.html|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

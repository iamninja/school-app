import { createPublicClient } from "@/lib/supabase/server";
import { athensToday } from "@/lib/push/athens-time";
import { SITE_SETTINGS_COLUMNS, companionHat, type SiteSettings } from "@/lib/site-season";

// The browser-tab icon (app/layout.tsx): the Modus dots, with the Santa hat
// on the Christmas decorations' days when the App tab's hat switch is on
// (lib/site-season.ts). A redirect to one of two static files in
// public/icons, cached for an hour so the tab icon follows the dates
// without a database read per page. If the settings can't be read, the
// plain icon.

const PLAIN = "/icons/favicon-64.png";
const CHRISTMAS = "/icons/favicon-christmas-64.png";

export async function GET(request: Request) {
  let hat = false;
  try {
    const { data } = await createPublicClient()
      .from("site_settings")
      .select(SITE_SETTINGS_COLUMNS)
      .eq("id", 1)
      .maybeSingle();
    hat = data ? companionHat(data as unknown as SiteSettings, athensToday()) : false;
  } catch {
    hat = false;
  }
  return new Response(null, {
    status: 307,
    headers: {
      Location: new URL(hat ? CHRISTMAS : PLAIN, request.url).toString(),
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}

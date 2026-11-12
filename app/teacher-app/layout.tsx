import type { Metadata, Viewport } from "next";
import { CompanionShell } from "@/components/teacher-app/shell";
import { requireCompanionTeacher } from "@/app/teacher-app/session";
import { loadTestsBadge } from "@/lib/teacher-app/load";
import { athensToday } from "@/lib/push/athens-time";
import { SITE_SETTINGS_COLUMNS, companionHat, type SiteSettings } from "@/lib/site-season";

export const metadata: Metadata = {
  title: "Modus — Teacher",
};

// Draw edge to edge, under Android's gesture/button bar and the iPhone home
// indicator: the shell's header and tab bar already pad themselves with the
// safe-area insets (components/teacher-app/shell.tsx), so the strip under the
// tab bar takes the app's own colour - dark in dark mode - instead of the
// system bar Android paints from the manifest's single, light colour.
// Companion only: the portals don't pad for the insets everywhere yet.
// Merged per key with the root layout's viewport (its theme colours stay).
export const viewport: Viewport = {
  viewportFit: "cover",
};

export default async function TeacherAppLayout({ children }: { children: React.ReactNode }) {
  const { supabase, teacherId } = await requireCompanionTeacher();
  // A missing badge never takes the app down.
  const today = athensToday();
  const [testsBadge, santaHat] = await Promise.all([
    loadTestsBadge(supabase, teacherId, today).catch(() => 0),
    // The front page's Christmas hat (App tab), on this app's logo too; a
    // settings read that fails just means no hat.
    Promise.resolve(supabase.from("site_settings").select(SITE_SETTINGS_COLUMNS).eq("id", 1).maybeSingle())
      .then(({ data }) => (data ? companionHat(data as unknown as SiteSettings, today) : false))
      .catch(() => false),
  ]);
  return (
    <CompanionShell testsBadge={testsBadge} santaHat={santaHat}>
      {children}
    </CompanionShell>
  );
}

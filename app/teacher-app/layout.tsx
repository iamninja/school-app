import type { Metadata, Viewport } from "next";
import { CompanionShell } from "@/components/teacher-app/shell";
import { requireCompanionTeacher } from "@/app/teacher-app/session";
import { loadTestsBadge } from "@/lib/teacher-app/load";
import { athensToday } from "@/lib/push/athens-time";

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
  const testsBadge = await loadTestsBadge(supabase, teacherId, athensToday()).catch(() => 0);
  return <CompanionShell testsBadge={testsBadge}>{children}</CompanionShell>;
}

import { Loader2Icon } from "lucide-react";

// /protected/teacher is a fully dynamic route (checks the session, then a
// dozen-plus sequential Supabase reads) with no static shell to prefetch -
// without this file, a client-side navigation here (e.g. teacher-login-form's
// router.push) shows nothing at all until the whole thing resolves, which
// reads as "stuck" rather than "loading". See node_modules/next/dist/docs/
// 01-app/01-getting-started/04-linking-and-navigating.md#dynamic-routes-without-loadingtsx.
export default function TeacherDashboardLoading() {
  return (
    <div className="flex min-h-svh w-full items-center justify-center gap-2 text-sm text-muted-foreground">
      <Loader2Icon className="h-4 w-4 animate-spin" />
      Loading your dashboard…
    </div>
  );
}

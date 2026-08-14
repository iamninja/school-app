import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ParentDashboard } from "@/components/parent-dashboard";
import { getParentDashboardDataAction } from "@/app/auth/parent/actions";

export default async function ParentDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/parent-login");
  }

  const result = await getParentDashboardDataAction();

  if (!result.success) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-bold">Access Denied</h1>
          <p className="text-muted-foreground">
            {result.error || "No parent record found for this account"}
          </p>
          <a href="/auth/parent-login" className="text-primary hover:underline">
            Return to login
          </a>
        </div>
      </div>
    );
  }

  if (!result.data) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-bold">Access Denied</h1>
          <p className="text-muted-foreground">
            No parent record found for this account
          </p>
          <a href="/auth/parent-login" className="text-primary hover:underline">
            Return to login
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <ParentDashboard
        parent={result.data.parent}
        student={result.data.student}
        allParents={result.data.allParents}
        classes={result.data.classes}
        schedules={result.data.schedules}
        attendance={result.data.attendance}
      />
    </div>
  );
}

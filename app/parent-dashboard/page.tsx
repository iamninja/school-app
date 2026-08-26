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
          <h1 className="text-2xl font-bold">Δεν επιτρέπεται η πρόσβαση</h1>
          <p className="text-muted-foreground">
            {result.error || "Δεν βρέθηκε λογαριασμός γονέα για αυτόν τον χρήστη"}
          </p>
          <a href="/auth/parent-login" className="text-primary hover:underline">
            Επιστροφή στη σύνδεση
          </a>
        </div>
      </div>
    );
  }

  if (!result.data) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-bold">Δεν επιτρέπεται η πρόσβαση</h1>
          <p className="text-muted-foreground">
            Δεν βρέθηκε λογαριασμός γονέα για αυτόν τον χρήστη
          </p>
          <a href="/auth/parent-login" className="text-primary hover:underline">
            Επιστροφή στη σύνδεση
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <ParentDashboard
        parent={result.data.parent}
        allParents={result.data.allParents}
        kids={result.data.kids}
        balance={result.data.balance}
      />
    </div>
  );
}

"use client";

import * as React from "react";
import { GraduationCap, Users } from "lucide-react";

import { StudentDashboardEn } from "@/components/student-dashboard-en";
import { ParentDashboardEn } from "@/components/parent-dashboard-en";
import {
  DEMO_EN_PARENT_DASHBOARD,
  DEMO_EN_STUDENT_DASHBOARD,
  DEMO_EN_STUDENT_QUIZ_REVIEWS,
} from "@/lib/demo-data-en";
import { cn } from "@/lib/utils";

type DemoView = "student" | "parent";

/**
 * English counterpart to /demo (app/demo/page.tsx) - same idea (public,
 * unauthenticated preview fed hand-written sample data instead of
 * Supabase), just an English-speaking family instead of a Greek one.
 * Deliberately not linked from the homepage yet - reachable only by going
 * directly to /demo-en.
 */
export default function DemoEnPage() {
  const [view, setView] = React.useState<DemoView>("student");

  return (
    <div className="relative">
      {view === "student" ? (
        <StudentDashboardEn
          {...DEMO_EN_STUDENT_DASHBOARD}
          demoMode
          demoReviews={DEMO_EN_STUDENT_QUIZ_REVIEWS}
        />
      ) : (
        <ParentDashboardEn {...DEMO_EN_PARENT_DASHBOARD} demoMode />
      )}

      <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
        <div className="flex items-center gap-1 rounded-full border border-border bg-card p-1 shadow-lg">
          <button
            type="button"
            onClick={() => setView("student")}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium transition-colors",
              view === "student"
                ? "bg-brand text-brand-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <GraduationCap className="size-4" aria-hidden="true" />
            Student portal
          </button>
          <button
            type="button"
            onClick={() => setView("parent")}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium transition-colors",
              view === "parent"
                ? "bg-brand text-brand-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Users className="size-4" aria-hidden="true" />
            Parent portal
          </button>
        </div>
      </div>
    </div>
  );
}

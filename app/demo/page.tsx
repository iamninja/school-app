"use client";

import * as React from "react";
import { GraduationCap, Users } from "lucide-react";

import { StudentDashboard } from "@/components/student-dashboard";
import { ParentDashboard } from "@/components/parent-dashboard";
import {
  DEMO_PARENT_DASHBOARD,
  DEMO_STUDENT_DASHBOARD,
  DEMO_STUDENT_QUIZ_REVIEWS,
} from "@/lib/demo-data";
import { cn } from "@/lib/utils";

type DemoView = "student" | "parent";

/**
 * Public, unauthenticated preview of the student/parent portals for
 * prospective families - same components the real portals render, fed
 * hand-written sample data from lib/demo-data.ts instead of Supabase, so it
 * can never drift into looking unlike the real product.
 */
export default function DemoPage() {
  const [view, setView] = React.useState<DemoView>("student");

  return (
    <div className="relative">
      {view === "student" ? (
        <StudentDashboard
          {...DEMO_STUDENT_DASHBOARD}
          demoMode
          demoReviews={DEMO_STUDENT_QUIZ_REVIEWS}
        />
      ) : (
        <ParentDashboard {...DEMO_PARENT_DASHBOARD} demoMode />
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
            Πύλη μαθητή
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
            Πύλη γονέα
          </button>
        </div>
      </div>
    </div>
  );
}

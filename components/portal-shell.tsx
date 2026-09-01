"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

import { BrandDots, ModusLogo } from "@/components/brand";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const PORTAL_SHELL_LABELS = {
  el: {
    homeAriaLabel: "Modus — Αρχική",
    demoBanner:
      "Δοκιμαστική προβολή με δείγμα δεδομένων — δεν αντιστοιχεί σε πραγματικό μαθητή ή γονέα.",
    signOut: "Αποσύνδεση",
    exitDemo: "Έξοδος από τη δοκιμαστική προβολή",
    footer:
      "Φροντιστήριο Μαθηματικών Modus · Βάγιος Βλάχος · Ηρώων Πολυτεχνείου 3, 1ος όροφος, Καρδίτσα",
  },
  en: {
    homeAriaLabel: "Modus — Home",
    demoBanner:
      "Sample-data preview — this doesn't correspond to a real student or parent.",
    signOut: "Sign out",
    exitDemo: "Exit preview",
    footer: "Modus Math Tutoring · Karditsa, Greece",
  },
};

/**
 * Shared chrome for the parent and student portal views: branded top bar,
 * content column, and a signage footer. Real families only ever see the
 * Greek copy (locale defaults to "el") - the English strings exist for the
 * public /demo-en preview page.
 */
export function PortalShell({
  roleLabel,
  children,
  demoMode = false,
  locale = "el",
}: {
  roleLabel: string;
  children: React.ReactNode;
  /** No real session exists in demo mode - swaps sign-out for a plain link back to "/" instead of calling Supabase. */
  demoMode?: boolean;
  locale?: "en" | "el";
}) {
  const router = useRouter();
  const labels = PORTAL_SHELL_LABELS[locale];

  const handleSignOut = async () => {
    if (demoMode) {
      router.push("/");
      return;
    }
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {demoMode && (
        <div className="border-b border-brand/20 bg-brand/10 px-5 py-2 text-center text-xs font-medium text-foreground sm:text-sm">
          {labels.demoBanner}
        </div>
      )}
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-5">
          <Link href="/" aria-label={labels.homeAriaLabel}>
            <ModusLogo size={30} variant="compact" priority />
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground sm:inline-flex">
              {roleLabel}
            </span>
            <ThemeSwitcher />
            <Button variant="outline" size="sm" onClick={handleSignOut}>
              <LogOut className="size-3.5" aria-hidden="true" />
              {demoMode ? labels.exitDemo : labels.signOut}
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-8 lg:py-10">
        {children}
      </main>

      <footer className="border-t border-border/70">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-6 text-xs text-muted-foreground">
          <p>{labels.footer}</p>
          <BrandDots dotClassName="size-1" />
        </div>
      </footer>
    </div>
  );
}

/**
 * Compact stat tile for the dashboard overview rows.
 */
export function StatTile({
  label,
  value,
  tone = "default",
  className,
}: {
  label: string;
  value: React.ReactNode;
  tone?: "default" | "brand" | "positive" | "warning" | "negative";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border/80 bg-card p-4 shadow-xs",
        className,
      )}
    >
      <p
        className={cn(
          "text-3xl font-bold tabular-nums tracking-tight",
          tone === "positive" && "text-emerald-700 dark:text-emerald-400",
          tone === "warning" && "text-amber-700 dark:text-amber-400",
          tone === "negative" && "text-red-700 dark:text-red-400",
        )}
      >
        {value}
      </p>
      <div className="mt-1 flex items-center gap-2">
        {tone === "brand" ? (
          <span className="size-1.5 rounded-full bg-brand" aria-hidden="true" />
        ) : null}
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

/**
 * Attendance status chip - present / late / absent / split (1+1), dark-mode safe.
 */
export function AttendanceChip({
  status,
  label,
}: {
  status: string;
  label: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold",
        status === "present" &&
          "border-emerald-600/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
        status === "late" &&
          "border-amber-600/25 bg-amber-500/10 text-amber-700 dark:text-amber-400",
        status === "absent" &&
          "border-red-600/25 bg-red-500/10 text-red-700 dark:text-red-400",
        status === "split" &&
          "border-violet-600/25 bg-violet-500/10 text-violet-700 dark:text-violet-400",
      )}
    >
      {label}
    </span>
  );
}

/**
 * Small-caps section label with the dot accent, used above card groups.
 */
export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
      <span className="size-1.5 rounded-full bg-brand" aria-hidden="true" />
      {children}
    </p>
  );
}

"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CalendarCheck, LogOut, Monitor, MoreVertical, NotebookPen } from "lucide-react";

import { ModusLogo } from "@/components/brand";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createClient } from "@/lib/supabase/client";
import { forgetPushDeviceBeforeSignOut } from "@/components/use-push-device";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/teacher-app", label: "Today", icon: CalendarCheck },
  { href: "/teacher-app/homework", label: "Homework", icon: NotebookPen },
];

/**
 * Phone chrome for the teacher companion: a slim top bar (logo, theme, menu
 * with "Full console" and sign out) and a bottom tab bar within thumb reach.
 * Padding respects the notch/home-indicator safe areas of an installed app.
 */
export function CompanionShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const handleSignOut = async () => {
    await forgetPushDeviceBeforeSignOut();
    await createClient().auth.signOut();
    router.push("/auth/teacher-login");
  };

  // The lesson screen belongs to Today; everything else matches its own tab.
  const activeHref = pathname.startsWith("/teacher-app/homework")
    ? "/teacher-app/homework"
    : "/teacher-app";

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/90 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-md items-center justify-between px-4">
          <Link href="/teacher-app" aria-label="Modus — Today">
            <ModusLogo size={26} variant="compact" priority />
          </Link>
          <div className="flex items-center gap-1">
            <ThemeSwitcher />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Menu">
                  <MoreVertical className="size-5" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  {/* A plain anchor: the switch route sets a cookie and redirects. */}
                  <a href="/teacher-app/switch?to=console">
                    <Monitor className="size-4" aria-hidden="true" />
                    Full console
                  </a>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={handleSignOut}>
                  <LogOut className="size-4" aria-hidden="true" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-md flex-1 px-4 pb-24 pt-4">{children}</main>

      <nav
        aria-label="Teacher app"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
      >
        <div className="mx-auto grid h-16 w-full max-w-md grid-cols-2">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = activeHref === href;
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 text-xs font-medium",
                  active ? "text-brand" : "text-muted-foreground",
                )}
              >
                <Icon className="size-5" aria-hidden="true" />
                {label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

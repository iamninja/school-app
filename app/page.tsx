import { DeployButton } from "@/components/deploy-button";
import { EnvVarWarning } from "@/components/env-var-warning";
import { AuthButton } from "@/components/auth-button";
import { Hero } from "@/components/hero";
import { ShadcnDemo } from "@/components/shadcn-demo";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { ConnectSupabaseSteps } from "@/components/tutorial/connect-supabase-steps";
import { SignUpUserSteps } from "@/components/tutorial/sign-up-user-steps";
import { Button } from "@/components/ui/button";
import { hasEnvVars } from "@/lib/utils";
import Link from "next/link";
import { Suspense } from "react";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center">
      <div className="flex-1 w-full flex flex-col gap-20 items-center">
        <nav className="w-full flex justify-center border-b border-b-foreground/10 h-16">
          <div className="w-full max-w-5xl flex justify-between items-center p-3 px-5 text-sm">
            <div className="flex gap-5 items-center font-semibold">
              <Link href={"/"}>Next.js Supabase Starter</Link>
              <div className="flex items-center gap-2">
                <DeployButton />
              </div>
            </div>
            {!hasEnvVars ? (
              <EnvVarWarning />
            ) : (
              <Suspense>
                <AuthButton />
              </Suspense>
            )}
          </div>
        </nav>
        <div className="flex-1 flex flex-col gap-20 max-w-5xl p-5">
          <Hero />
          <div className="grid gap-6 md:grid-cols-2">
            <div className="flex flex-col items-start gap-4 rounded-xl border bg-card/40 p-6 shadow-sm">
              <div>
                <h2 className="text-lg font-semibold">Teacher dashboard</h2>
                <p className="text-sm text-muted-foreground">
                  Manage classes, schedules, and students in one place.
                </p>
              </div>
              <Button asChild>
                <Link href="/protected/teacher">Open teacher dashboard</Link>
              </Button>
            </div>
            <div className="flex flex-col items-start gap-4 rounded-xl border bg-card/40 p-6 shadow-sm">
              <div>
                <h2 className="text-lg font-semibold">Student portal</h2>
                <p className="text-sm text-muted-foreground">
                  View your schedule, attendance, and class information.
                </p>
              </div>
              <Button asChild variant="outline">
                <Link href="/auth/student-login">Login as Student</Link>
              </Button>
            </div>
          </div>
          <ShadcnDemo />
          <main className="flex-1 flex flex-col gap-6 px-4">
            <h2 className="font-medium text-xl mb-4">Next steps</h2>
            {hasEnvVars ? <SignUpUserSteps /> : <ConnectSupabaseSteps />}
          </main>
        </div>

        <footer className="w-full flex items-center justify-center border-t mx-auto text-center text-xs gap-8 py-16">
          <p>
            Powered by{" "}
            <a
              href="https://supabase.com/?utm_source=create-next-app&utm_medium=template&utm_term=nextjs"
              target="_blank"
              className="font-bold hover:underline"
              rel="noreferrer"
            >
              Supabase
            </a>
          </p>
          <ThemeSwitcher />
        </footer>
      </div>
    </main>
  );
}

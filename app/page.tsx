import { AuthButton } from "@/components/auth-button";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Suspense } from "react";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center">
      <div className="flex-1 w-full flex flex-col gap-20 items-center">
        <nav className="w-full flex justify-center border-b border-b-foreground/10 h-16">
          <div className="w-full max-w-5xl flex justify-between items-center p-3 px-5 text-sm">
            <div className="flex gap-5 items-center font-semibold">
              <Link href={"/"}>Modus</Link>
            </div>
            <Suspense>
              <AuthButton locale="el" />
            </Suspense>
          </div>
        </nav>
        <div className="flex-1 flex flex-col gap-20 max-w-5xl p-5">
          <div className="flex flex-col gap-4 items-center text-center pt-8">
            <h1 className="text-4xl font-bold">Modus</h1>
            <p className="text-lg text-muted-foreground max-w-xl">
              Τάξεις, παρουσίες και τεστ για το φροντιστήριό σας, σε ένα
              μέρος.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            <div className="flex flex-col items-start gap-4 rounded-xl border bg-card/40 p-6 shadow-xs">
              <div>
                <h2 className="text-lg font-semibold">Καθηγητής</h2>
                <p className="text-sm text-muted-foreground">
                  Διαχείριση τάξεων, προγράμματος και μαθητών σε ένα μέρος.
                </p>
              </div>
              <Button asChild>
                <Link href="/protected/teacher">Είσοδος καθηγητή</Link>
              </Button>
            </div>
            <div className="flex flex-col items-start gap-4 rounded-xl border bg-card/40 p-6 shadow-xs">
              <div>
                <h2 className="text-lg font-semibold">Μαθητές</h2>
                <p className="text-sm text-muted-foreground">
                  Δείτε το πρόγραμμα, τις παρουσίες και τις τάξεις σας.
                </p>
              </div>
              <Button asChild variant="outline">
                <Link href="/auth/student-login">Είσοδος μαθητή</Link>
              </Button>
            </div>
            <div className="flex flex-col items-start gap-4 rounded-xl border bg-card/40 p-6 shadow-xs">
              <div>
                <h2 className="text-lg font-semibold">Γονείς</h2>
                <p className="text-sm text-muted-foreground">
                  Δείτε το πρόγραμμα, τις παρουσίες και τις τάξεις του
                  παιδιού σας.
                </p>
              </div>
              <Button asChild variant="outline">
                <Link href="/auth/parent-login">Είσοδος γονέα</Link>
              </Button>
            </div>
          </div>
        </div>

        <footer className="w-full flex items-center justify-center border-t mx-auto text-center text-xs gap-8 py-16">
          <ThemeSwitcher />
        </footer>
      </div>
    </main>
  );
}

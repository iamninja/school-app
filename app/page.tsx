import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  ClipboardCheck,
  MapPin,
  PenLine,
  Phone,
  Sigma,
  Users,
} from "lucide-react";

import { BrandDots, BrandMark, MathDoodles, ModusLogo } from "@/components/brand";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { Button } from "@/components/ui/button";

const CENTER_FEATURES = [
  {
    icon: Sigma,
    title: "Μαθηματικά με μέθοδο",
    description:
      "Μάθημα πρόσωπο με πρόσωπο, σε ολιγομελή τμήματα, με έμφαση στην κατανόηση — όχι στην αποστήθιση.",
  },
  {
    icon: PenLine,
    title: "Γυμνάσιο, Λύκειο & ΕΠΑ.Λ.",
    description:
      "Από τις βάσεις του Γυμνασίου μέχρι τη στοχευμένη προετοιμασία για τις Πανελλαδικές — σε ΓΕ.Λ. και ΕΠΑ.Λ.",
  },
  {
    icon: Users,
    title: "Ουσιαστική επικοινωνία",
    description:
      "Οι γονείς γνωρίζουν ανά πάσα στιγμή την πορεία του παιδιού τους — από τον ίδιο τον καθηγητή.",
  },
];

const PORTAL_ROLES = [
  {
    title: "Μαθητές",
    description:
      "Το πρόγραμμά σου, οι παρουσίες σου και τα διαγωνίσματά σου — όλα σε μία σελίδα.",
    href: "/auth/student-login",
    cta: "Είσοδος μαθητή",
    primary: true,
  },
  {
    title: "Γονείς",
    description:
      "Δείτε με μια ματιά το πρόγραμμα, τις παρουσίες και την πρόοδο του παιδιού σας.",
    href: "/auth/parent-login",
    cta: "Είσοδος γονέα",
    primary: false,
  },
];

const PORTAL_POINTS = [
  {
    icon: CalendarDays,
    title: "Εβδομαδιαίο πρόγραμμα",
    description: "Ημέρες και ώρες κάθε τμήματος, πάντα ενημερωμένα.",
  },
  {
    icon: ClipboardCheck,
    title: "Παρουσίες",
    description: "Κάθε παρουσία καταγράφεται στο μάθημα και φαίνεται αμέσως.",
  },
  {
    icon: PenLine,
    title: "Διαγωνίσματα",
    description: "Τεστ και αποτελέσματα, με πλήρη εικόνα της προόδου.",
  },
];

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col bg-background">
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-5">
          <Link href="/" aria-label="Modus — Αρχική">
            <ModusLogo size={34} variant="compact" priority />
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <Link
              href="#portal"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              Η πύλη
            </Link>
          </div>
        </div>
      </header>

      {/* Hero - the storefront. Identity first. */}
      <section className="relative overflow-hidden border-b border-border/70">
        <div className="bg-grid-paper mask-fade-b absolute inset-0" aria-hidden="true" />
        <MathDoodles className="pointer-events-none absolute -right-16 top-1/2 hidden w-[420px] -translate-y-1/2 text-muted-foreground/60 lg:block xl:right-4" />
        <div className="relative mx-auto w-full max-w-6xl px-5 py-20 lg:py-28">
          <div className="max-w-2xl">
            <BrandMark className="mb-8 h-16 w-auto text-foreground" />
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-muted-foreground">
              Φροντιστήριο Μαθηματικών
            </p>
            <h1 className="mt-3 text-6xl font-bold tracking-tight sm:text-7xl">
              Modus
            </h1>
            <p className="mt-6 text-xl leading-relaxed text-muted-foreground sm:text-2xl">
              Μαθηματικά για Γυμνάσιο, Λύκειο και ΕΠΑ.Λ.,
              <br className="hidden sm:block" /> στην Καρδίτσα, με τον{" "}
              <span className="font-semibold text-foreground">
                Βάγιο Βλάχο
              </span>
              .
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <p className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium shadow-xs">
                <MapPin className="size-4 text-brand" aria-hidden="true" />
                Ηρώων Πολυτεχνείου 3, 1ος όροφος, Καρδίτσα
              </p>
              <a
                href="tel:+306947846590"
                className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium shadow-xs transition-colors hover:border-brand/60"
              >
                <Phone className="size-4 text-brand" aria-hidden="true" />
                694 784 6590
              </a>
            </div>
            <p className="mt-8 inline-flex items-center gap-2 rounded-full border border-brand/40 bg-brand/10 px-4 py-2 text-sm font-semibold">
              <CalendarDays className="size-4 text-brand" aria-hidden="true" />
              Εγγραφές από 24/8
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button asChild size="lg">
                <Link href="/auth/student-login">
                  Είσοδος μαθητή
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/auth/parent-login">Είσοδος γονέα</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* The actual product: the classroom */}
      <section className="mx-auto w-full max-w-6xl px-5 py-16 lg:py-20">
        <BrandDots className="mb-4" />
        <h2 className="text-3xl font-bold tracking-tight">Το φροντιστήριο</h2>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Το μάθημα γίνεται στην τάξη — εκεί είναι η δουλειά μας. Καθημερινή,
          προσωπική διδασκαλία των μαθηματικών, με πρόγραμμα και συνέπεια.
        </p>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {CENTER_FEATURES.map((feature) => (
            <div
              key={feature.title}
              className="rounded-2xl border border-border/80 bg-card p-6 shadow-xs"
            >
              <div className="mb-4 inline-flex size-11 items-center justify-center rounded-xl bg-brand/15 text-foreground">
                <feature.icon className="size-5" aria-hidden="true" />
              </div>
              <h3 className="text-lg font-semibold">{feature.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* The companion portal */}
      <section
        id="portal"
        className="border-y border-border/70 bg-secondary/40 scroll-mt-20"
      >
        <div className="mx-auto w-full max-w-6xl px-5 py-16 lg:py-20">
          <BrandDots className="mb-4" />
          <h2 className="text-3xl font-bold tracking-tight">Η πύλη Modus</h2>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Το ψηφιακό συμπλήρωμα του φροντιστηρίου. Για τους μαθητές και τους
            γονείς μας — ό,τι χρειάζεστε, με μια ματιά.
          </p>

          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {PORTAL_POINTS.map((point) => (
              <div key={point.title} className="flex items-start gap-3">
                <point.icon
                  className="mt-0.5 size-5 shrink-0 text-brand"
                  aria-hidden="true"
                />
                <div>
                  <p className="font-semibold">{point.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {point.description}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-12 grid gap-6 md:grid-cols-2">
            {PORTAL_ROLES.map((role) => (
              <div
                key={role.title}
                className="flex flex-col gap-4 rounded-2xl border border-border/80 bg-card p-6 shadow-xs transition-shadow hover:shadow-md"
              >
                <div className="flex-1">
                  <h3 className="text-lg font-semibold">{role.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {role.description}
                  </p>
                </div>
                <Button
                  asChild
                  variant={role.primary ? "default" : "outline"}
                  className="w-fit"
                >
                  <Link href={role.href}>{role.cta}</Link>
                </Button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer - signage again */}
      <footer className="mx-auto w-full max-w-6xl px-5 py-12">
        <div className="flex flex-col items-start justify-between gap-8 sm:flex-row sm:items-center">
          <div className="space-y-3">
            <ModusLogo size={30} variant="compact" />
            <p className="text-sm text-muted-foreground">
              Φροντιστήριο Μαθηματικών · Βάγιος Βλάχος
              <br />
              Ηρώων Πολυτεχνείου 3, 1ος όροφος, Καρδίτσα
              <br />
              <a
                href="tel:+306947846590"
                className="transition-colors hover:text-foreground"
              >
                694 784 6590
              </a>
            </p>
          </div>
          <div className="flex items-center gap-4">
            <p className="text-xs text-muted-foreground">
              © {new Date().getFullYear()} Modus
            </p>
            <ThemeSwitcher />
          </div>
        </div>
      </footer>
    </main>
  );
}

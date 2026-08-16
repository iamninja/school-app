import Image from "next/image";

import { cn } from "@/lib/utils";

const LOGO_RATIO = 348 / 129;

const LOGO_FILES = {
  full: { light: "modus-logo-horizontal.svg", dark: "modus-logo-horizontal-dark.svg" },
  compact: { light: "modus-logo-compact.svg", dark: "modus-logo-compact-dark.svg" },
} as const;

/**
 * The real horizontal logo files from public/branding, swapped for dark mode.
 * "compact" drops the tagline/name lines for small footprints (topbar, footer)
 * where they'd render illegibly small — same three-dot mark, bigger "Modus".
 */
export function ModusLogo({
  size = 32,
  className,
  priority = false,
  variant = "full",
}: {
  size?: number;
  className?: string;
  priority?: boolean;
  variant?: "full" | "compact";
}) {
  const width = Math.round(size * LOGO_RATIO);
  const files = LOGO_FILES[variant];
  return (
    <span className={cn("inline-flex shrink-0 items-center", className)}>
      <Image
        src={`/branding/${files.light}`}
        alt="Modus — Φροντιστήριο Μαθηματικών, Βάγιος Βλάχος"
        width={width}
        height={size}
        priority={priority}
        unoptimized
        className="dark:hidden"
      />
      <Image
        src={`/branding/${files.dark}`}
        alt="Modus — Φροντιστήριο Μαθηματικών, Βάγιος Βλάχος"
        width={width}
        height={size}
        priority={priority}
        unoptimized
        className="hidden dark:block"
      />
    </span>
  );
}

/**
 * The three-dot mark, same geometry as public/branding/modus-mark.svg but
 * inlined with currentColor for the two ink dots so it adapts to dark mode.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 97 90"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="48.249" cy="24" r="12" fill="currentColor" />
      <circle cx="24" cy="66" r="12" fill="currentColor" />
      <circle cx="72.497" cy="66" r="12" className="fill-brand" />
    </svg>
  );
}

/**
 * Decorative row of the three brand dots - two ink, one gold.
 * Used as a section divider / accent.
 */
export function BrandDots({
  className,
  dotClassName = "size-1.5",
}: {
  className?: string;
  dotClassName?: string;
}) {
  return (
    <span
      className={cn("inline-flex items-center gap-1.5", className)}
      aria-hidden="true"
    >
      <span className={cn("rounded-full bg-foreground/80", dotClassName)} />
      <span className={cn("rounded-full bg-foreground/80", dotClassName)} />
      <span className={cn("rounded-full bg-brand", dotClassName)} />
    </span>
  );
}

/**
 * Hand-drawn style math line art for the landing hero. Pure strokes, no
 * photography - a function graph with a jump discontinuity at x₀: the left
 * branch runs smooth and unbroken up to an open circle (the value the curve
 * approaches but never lands on), while the gold point marks where f(x₀)
 * actually lives, and the right branch carries on from there.
 */
export function MathDoodles({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 480 360"
      fill="none"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {/* axes */}
      <path
        d="M40 320 H440 M70 350 V40"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        opacity="0.45"
      />
      {/* left branch - smooth and continuous, climbing toward x₀ */}
      <path
        d="M95 302 C 130 296, 162 282, 192 258 C 216 239, 233 219, 243 199"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.7"
      />
      {/* open circle - the limit the left branch approaches but never attains */}
      <circle
        cx="249"
        cy="188"
        r="7.5"
        stroke="currentColor"
        strokeWidth="2.5"
        opacity="0.7"
      />
      {/* gold point - where f(x₀) actually lands, echoing the mark */}
      <circle cx="249" cy="108" r="8" className="fill-brand" />
      {/* right branch - continues from the true value */}
      <path
        d="M260 104 C 296 92, 336 84, 368 80 C 384 78, 396 77, 405 76"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.7"
      />
      {/* dashed helpers - the jump at x₀, and the height of f(x₀) */}
      <path
        d="M249 320 V200 M70 108 H236"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeDasharray="4 6"
        strokeLinecap="round"
        opacity="0.4"
      />
      {/* annotations */}
      <text
        x="352"
        y="52"
        fontSize="26"
        fill="currentColor"
        opacity="0.6"
        fontStyle="italic"
      >
        y=f(x)
      </text>
      <text
        x="240"
        y="347"
        fontSize="22"
        fill="currentColor"
        opacity="0.5"
        fontStyle="italic"
      >
        x₀
      </text>
    </svg>
  );
}

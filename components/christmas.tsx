import { cn } from "@/lib/utils";

// The front page's Christmas look (lib/site-season.ts): snow and little
// figures falling behind the hero, a Santa hat on the logo, and a message.
// Server components, pure CSS animation (app/globals.css, "modus-fall") -
// no client script. Decorative only: hidden from screen readers and never
// in the way of a click.

type Figure = "flake" | "tree" | "gift" | "snowman" | "santa" | "pi" | "sqrt" | "sigma" | "infinity";

// Mostly snow; now and then a figure or a maths "flake".
const SEQUENCE: Figure[] = [
  "flake", "flake", "tree", "flake", "pi", "flake", "gift", "flake",
  "flake", "snowman", "flake", "sigma", "flake", "santa", "flake", "flake",
  "sqrt", "flake", "tree", "flake", "gift", "flake", "infinity", "flake",
  "flake", "snowman", "flake", "flake",
];

/** On a phone only the first ones fall, so the screen stays calm. */
const PHONE_COUNT = 12;

// A fixed pseudo-random sequence: the same layout on the server and every
// visit, so nothing jumps when the page loads.
function seeded(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

function FigureSvg({ figure }: { figure: Figure }) {
  switch (figure) {
    case "flake":
      return (
        <svg viewBox="0 0 24 24" className="size-full" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7M9 4l3 2 3-2M9 20l3-2 3 2" />
        </svg>
      );
    case "tree":
      return (
        <svg viewBox="0 0 24 24" className="size-full">
          <path d="M12 2 5 11h3l-4 6h16l-4-6h3z" className="fill-emerald-600 dark:fill-emerald-500" />
          <rect x="10.5" y="17" width="3" height="4" className="fill-amber-800" />
          <circle cx="12" cy="2.5" r="1.6" className="fill-brand" />
        </svg>
      );
    case "gift":
      return (
        <svg viewBox="0 0 24 24" className="size-full">
          <rect x="3" y="9" width="18" height="12" rx="1.5" className="fill-red-600 dark:fill-red-500" />
          <rect x="2" y="7" width="20" height="4" rx="1" className="fill-red-700 dark:fill-red-600" />
          <rect x="10.5" y="7" width="3" height="14" className="fill-brand" />
          <path d="M12 7C9 2 5 4 8 7M12 7c3-5 7-3 4 0" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-brand" />
        </svg>
      );
    case "snowman":
      return (
        <svg viewBox="0 0 24 24" className="size-full">
          <circle cx="12" cy="16" r="6" className="fill-white stroke-slate-400" strokeWidth="1" />
          <circle cx="12" cy="7.5" r="4" className="fill-white stroke-slate-400" strokeWidth="1" />
          <path d="M12 7.6l3 .9-3 .4z" className="fill-orange-500" />
          <circle cx="10.6" cy="6.6" r=".7" className="fill-slate-800" />
          <circle cx="13.2" cy="6.6" r=".7" className="fill-slate-800" />
          <path d="M8.3 10.6h7.4" stroke="currentColor" strokeWidth="1.6" className="text-red-600" />
        </svg>
      );
    case "santa":
      return (
        <svg viewBox="0 0 24 24" className="size-full">
          <path d="M5 11C6 5 10 2 15 3l4 5-2 1c-1-2-2-3-4-3" className="fill-red-600 dark:fill-red-500" />
          <circle cx="19" cy="8.5" r="1.6" className="fill-white" />
          <rect x="4.5" y="10" width="13" height="2.6" rx="1.3" className="fill-white" />
          <circle cx="11" cy="15" r="4.2" className="fill-orange-200" />
          <path d="M5.5 15.5c0 4 2.5 6.5 5.5 6.5s5.5-2.5 5.5-6.5c-1.6 1.4-3.4 2-5.5 2s-3.9-.6-5.5-2z" className="fill-white" />
          <circle cx="9.5" cy="14.3" r=".7" className="fill-slate-800" />
          <circle cx="12.5" cy="14.3" r=".7" className="fill-slate-800" />
        </svg>
      );
    default: {
      const symbol = { pi: "π", sqrt: "√", sigma: "Σ", infinity: "∞" }[figure];
      return (
        <svg viewBox="0 0 24 24" className="size-full">
          <text x="12" y="17.5" textAnchor="middle" fontSize="18" fontWeight="600" fill="currentColor" fontFamily="inherit">
            {symbol}
          </text>
        </svg>
      );
    }
  }
}

/** Falling snow and figures - place inside a `relative overflow-hidden` box. */
export function ChristmasSnow({ className }: { className?: string }) {
  const random = seeded(24_12);
  const items = SEQUENCE.map((figure, index) => {
    const isFlake = figure === "flake";
    const isSymbol = figure === "pi" || figure === "sqrt" || figure === "sigma" || figure === "infinity";
    const size = isFlake ? 6 + random() * 6 : isSymbol ? 11 + random() * 4 : 14 + random() * 6;
    const duration = 14 + random() * 14;
    return {
      figure,
      index,
      left: `${(index / SEQUENCE.length) * 100 + random() * 3}%`,
      size,
      duration,
      // Negative delays: the snow is already falling when the page opens.
      delay: -random() * duration,
      sway: 3 + random() * 4,
      drift: `${(random() - 0.5) * 60}px`,
      rest: `${8 + random() * 80}%`,
      tone: isFlake || isSymbol,
    };
  });

  return (
    <div className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)} aria-hidden="true">
      {items.map((item) => (
        <span
          key={item.index}
          className={cn(
            "modus-fall absolute -top-8",
            item.index >= PHONE_COUNT && "hidden sm:block",
            item.tone && "text-sky-400/70 dark:text-white/70",
          )}
          style={
            {
              left: item.left,
              width: item.size,
              height: item.size,
              "--fall-duration": `${item.duration}s`,
              "--fall-delay": `${item.delay}s`,
              "--fall-drift": item.drift,
              "--fall-rest": item.rest,
            } as React.CSSProperties
          }
        >
          <span
            className="modus-sway block size-full"
            style={{ "--sway-duration": `${item.sway}s` } as React.CSSProperties}
          >
            <FigureSvg figure={item.figure} />
          </span>
        </span>
      ))}
    </div>
  );
}

/**
 * A Santa hat for the brand mark's top dot - an overlay with BrandMark's
 * own viewBox, so it sits on the dot at any size. Put it in the same
 * `relative inline-block` box as the mark.
 */
export function SantaHat({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 97 90"
      className={cn("pointer-events-none absolute inset-0 size-full overflow-visible", className)}
      aria-hidden="true"
      focusable="false"
    >
      {/* the hat, leaning right over the top dot (cx 48.25, cy 24, r 12) */}
      <path d="M33 15 C 36 0, 52 -12, 72 -6 C 66 -2, 63 6, 63 15 Z" className="fill-red-600 dark:fill-red-500" />
      <circle cx="74" cy="-6" r="5" className="fill-white stroke-slate-300" strokeWidth="1" />
      <rect x="30" y="11" width="37" height="9" rx="4.5" className="fill-white stroke-slate-300" strokeWidth="1" />
    </svg>
  );
}

/** The season's message, where the enrolment badge used to be. */
export function ChristmasMessage({ message }: { message: string }) {
  return (
    <p className="mt-8 inline-flex items-center gap-2 rounded-full border border-red-500/40 bg-red-50 px-4 py-2 text-sm font-semibold dark:bg-red-950">
      <span className="inline-block size-4" aria-hidden="true">
        <FigureSvg figure="tree" />
      </span>
      {message}
    </p>
  );
}

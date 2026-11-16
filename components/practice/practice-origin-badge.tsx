import { BookMarkedIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/** Where a practice question comes from: "Πανελλαδικές · 2019 · Θέμα Β". */
export function PracticeOriginBadge({ label, className }: { label: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-full border border-brand/40 bg-brand/10 px-2.5 py-0.5 text-xs font-semibold text-foreground",
        className,
      )}
    >
      <BookMarkedIcon className="size-3.5 shrink-0 text-brand" aria-hidden="true" />
      <span className="truncate">{label}</span>
    </span>
  );
}

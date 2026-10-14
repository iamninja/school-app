"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatCompanionDate } from "@/components/teacher-app/format";

/**
 * ‹ previous lesson day · date · next lesson day ›. The date itself sits
 * over a native date input, so tapping it opens the phone's own picker.
 */
export function DateStrip({
  date,
  today,
  previous,
  next,
  basePath,
}: {
  date: string;
  today: string;
  previous: string | null;
  next: string | null;
  basePath: string;
}) {
  const router = useRouter();
  const hrefFor = (day: string) => (day === today ? basePath : `${basePath}?date=${day}`);

  return (
    <div className="flex items-center justify-between gap-2">
      <Button
        asChild={previous !== null}
        variant="outline"
        size="icon"
        className="size-11 shrink-0"
        disabled={previous === null}
        aria-label="Previous lesson day"
      >
        {previous !== null ? (
          <Link href={hrefFor(previous)}>
            <ChevronLeft className="size-5" aria-hidden="true" />
          </Link>
        ) : (
          <ChevronLeft className="size-5" aria-hidden="true" />
        )}
      </Button>

      <label className="relative flex min-h-11 flex-1 cursor-pointer flex-col items-center justify-center rounded-md px-2 text-center">
        <span className="text-base font-semibold">{formatCompanionDate(date)}</span>
        <span className="text-xs text-muted-foreground">
          {date === today ? "Today" : "Tap to pick a date"}
        </span>
        <input
          type="date"
          aria-label="Pick a date"
          value={date}
          onChange={(event) => {
            if (event.target.value) router.push(hrefFor(event.target.value));
          }}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </label>

      <Button
        asChild={next !== null}
        variant="outline"
        size="icon"
        className="size-11 shrink-0"
        disabled={next === null}
        aria-label="Next lesson day"
      >
        {next !== null ? (
          <Link href={hrefFor(next)}>
            <ChevronRight className="size-5" aria-hidden="true" />
          </Link>
        ) : (
          <ChevronRight className="size-5" aria-hidden="true" />
        )}
      </Button>
    </div>
  );
}

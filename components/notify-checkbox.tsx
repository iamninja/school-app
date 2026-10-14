"use client";

import { BellIcon } from "lucide-react";

/**
 * The "tell them about it" box on teacher forms (homework, lesson changes,
 * marks) - ticked by default; untick it to save quietly, e.g. a typo fix or
 * a test entry. Whether the notice actually goes out also depends on the
 * App tab's switches.
 */
export function NotifyCheckbox({
  id,
  checked,
  onChange,
  label = "Notify students",
}: {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
}) {
  return (
    <label htmlFor={id} className="flex items-center gap-2 text-sm">
      <input
        id={id}
        type="checkbox"
        className="size-4 accent-brand"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <BellIcon className="size-3.5 text-muted-foreground" aria-hidden="true" />
      {label}
    </label>
  );
}

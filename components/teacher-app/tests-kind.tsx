import type { AssessmentKind } from "@/lib/types/database";
import { cn } from "@/lib/utils";

// Mock exams and short tests, told apart at a glance on the Tests tab.
const KIND = {
  mock_exam: { label: "Mock exam", chip: "bg-indigo-500/15 text-indigo-800 dark:text-indigo-300" },
  short_assessment: { label: "Short test", chip: "bg-cyan-500/15 text-cyan-800 dark:text-cyan-300" },
} as const;

export function TestKindChip({ kind }: { kind: AssessmentKind }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        KIND[kind].chip,
      )}
    >
      {KIND[kind].label}
    </span>
  );
}

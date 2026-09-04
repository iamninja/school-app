import { Badge } from "@/components/ui/badge";
import type { TestAssignmentStatus } from "@/lib/types/database";

// Shared by the Tests tab and the class/student detail tie-ins. "Late" is
// deliberately a second badge shown ALONGSIDE the status, never a status
// value itself - see lib/test-status.ts for why: it has to survive a
// taken -> marked transition, which a single status enum can't express.
const STATUS_LABELS: Record<TestAssignmentStatus, string> = {
  registered: "Registered",
  taken: "Taken",
  marked: "Marked",
};

const STATUS_VARIANTS: Record<
  TestAssignmentStatus,
  "outline" | "secondary" | "default"
> = {
  registered: "outline",
  taken: "secondary",
  marked: "default",
};

export function TestStatusBadge({
  status,
  isLate,
}: {
  status: TestAssignmentStatus;
  isLate: boolean;
}) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <Badge variant={STATUS_VARIANTS[status]}>{STATUS_LABELS[status]}</Badge>
      {isLate ? <Badge variant="destructive">Late</Badge> : null}
    </span>
  );
}

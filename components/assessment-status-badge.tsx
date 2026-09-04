import { Badge } from "@/components/ui/badge";
import type { AssessmentAssignmentStatus } from "@/lib/types/database";

// Shared by the Assessments tab and the class/student detail tie-ins.
// "Late" is deliberately a second badge shown ALONGSIDE the status, never
// a status value itself - see lib/assessment-status.ts for why: it has to
// survive a taken -> marked transition, which a single status enum can't
// express.
const STATUS_LABELS: Record<AssessmentAssignmentStatus, string> = {
  registered: "Registered",
  taken: "Taken",
  marked: "Marked",
};

const STATUS_VARIANTS: Record<
  AssessmentAssignmentStatus,
  "outline" | "secondary" | "default"
> = {
  registered: "outline",
  taken: "secondary",
  marked: "default",
};

export function AssessmentStatusBadge({
  status,
  isLate,
}: {
  status: AssessmentAssignmentStatus;
  isLate: boolean;
}) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <Badge variant={STATUS_VARIANTS[status]}>{STATUS_LABELS[status]}</Badge>
      {isLate ? <Badge variant="destructive">Late</Badge> : null}
    </span>
  );
}

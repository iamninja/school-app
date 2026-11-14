import { ClassFilesPanel } from "@/components/class-files-panel";
import type { ClassFile } from "@/lib/types/database";

/** The phone's "Files" block under homework: post a PDF or link to the class. */
export function CompanionClassFiles({
  classId,
  files,
  homework,
}: {
  classId: string;
  files: ClassFile[];
  homework: { id: string; note: string }[];
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold">Files</h2>
      <ClassFilesPanel
        key={classId}
        classId={classId}
        initialFiles={files}
        homework={homework}
        compact
      />
    </section>
  );
}

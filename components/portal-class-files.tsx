import { format } from "date-fns";
import { el } from "date-fns/locale";
import { FileTextIcon, FolderOpenIcon, LinkIcon, PinIcon } from "lucide-react";

import { PortalHistoryDialog } from "@/components/portal-history-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatFileSize } from "@/lib/class-files";
import type { ClassFileSummary } from "@/lib/types/database";
import { cn } from "@/lib/utils";

const PREVIEW_COUNT = 5;

function linkLabel(file: ClassFileSummary): string {
  if (file.kind === "file") return `PDF ${formatFileSize(file.sizeBytes)}`.trim();
  return file.isDrive ? "Google Drive" : "Σύνδεσμος";
}

/** One file as a tappable row: opens the PDF (or link) in a new tab. */
export function PortalClassFileLink({
  file,
  showClass = true,
  dense = false,
}: {
  file: ClassFileSummary;
  showClass?: boolean;
  /** Smaller, for files under a homework item. */
  dense?: boolean;
}) {
  const Icon = file.kind === "file" ? FileTextIcon : LinkIcon;
  return (
    <a
      href={file.href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "flex items-start gap-2.5 rounded-lg border border-border/70 bg-background/60 transition hover:border-brand/50 hover:bg-brand/5",
        dense ? "px-2.5 py-1.5" : "px-3 py-2",
      )}
    >
      <Icon
        className={cn(
          "mt-0.5 shrink-0",
          dense ? "size-3.5" : "size-4",
          file.kind === "file" ? "text-red-500" : "text-sky-500",
        )}
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1">
        <span className={cn("flex items-center gap-1 font-medium", dense ? "text-xs" : "text-sm")}>
          {file.pinned ? <PinIcon className="size-3 shrink-0 text-brand" aria-label="Καρφιτσωμένο" /> : null}
          <span className="truncate">{file.title}</span>
        </span>
        {file.note && !dense ? (
          <span className="block text-xs text-muted-foreground">{file.note}</span>
        ) : null}
        <span className="block text-[11px] text-muted-foreground">
          {showClass && file.className ? `${file.className} · ` : ""}
          {format(new Date(file.createdAt), "d MMM", { locale: el })} · {linkLabel(file)}
        </span>
      </span>
    </a>
  );
}

/** A homework item's attached files, under its note. */
export function PortalHomeworkFiles({ files }: { files?: ClassFileSummary[] }) {
  if (!files || files.length === 0) return null;
  return (
    <div className="mt-2 space-y-1.5">
      {files.map((file) => (
        <PortalClassFileLink key={file.id} file={file} showClass={false} dense />
      ))}
    </div>
  );
}

/** The "Αρχεία" card: the classes' files not attached to homework. */
export function PortalClassFilesCard({ files }: { files?: ClassFileSummary[] }) {
  const list = files ?? [];
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <FolderOpenIcon className="size-4 text-brand" aria-hidden="true" />
          Αρχεία
        </CardTitle>
        {list.length > PREVIEW_COUNT ? (
          <PortalHistoryDialog triggerLabel="Όλα" title="Αρχεία">
            {list.map((file) => (
              <PortalClassFileLink key={file.id} file={file} />
            ))}
          </PortalHistoryDialog>
        ) : null}
      </CardHeader>
      <CardContent>
        {list.length === 0 ? (
          <p className="text-sm text-muted-foreground">Δεν υπάρχουν αρχεία ακόμα.</p>
        ) : (
          <div className="space-y-2">
            {list.slice(0, PREVIEW_COUNT).map((file) => (
              <PortalClassFileLink key={file.id} file={file} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

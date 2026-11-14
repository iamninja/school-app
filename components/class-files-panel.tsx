"use client";

import * as React from "react";
import { format } from "date-fns";
import {
  ExternalLinkIcon,
  FileTextIcon,
  LinkIcon,
  PencilIcon,
  PinIcon,
  PinOffIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";

import {
  createClassFileAction,
  deleteClassFileAction,
  discardClassFileUploadAction,
  listClassFilesAction,
  updateClassFileAction,
} from "@/app/protected/teacher/class-files-actions";
import { NotifyCheckbox } from "@/components/notify-checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  CLASS_FILE_ACCEPT,
  classFileHref,
  classFileProblem,
  defaultTitle,
  formatFileSize,
  isGoogleDriveLink,
  normalizeLink,
  sortClassFiles,
  uploadClassFile,
} from "@/lib/class-files";
import { getErrorMessage } from "@/lib/expected-error";
import { createClient } from "@/lib/supabase/client";
import type { ClassFile } from "@/lib/types/database";
import { cn } from "@/lib/utils";

export type HomeworkOption = { id: string; note: string };

const SELECT_CLASS =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function homeworkLabel(note: string): string {
  return note.length > 48 ? `${note.slice(0, 47)}…` : note;
}

/**
 * A class's files: PDFs and links posted for its students and parents,
 * pinned first, then newest. Post, rename, pin, attach to homework,
 * delete. Shared by the console's class page and the phone's Homework tab.
 * Without `initialFiles` it loads the class's files itself.
 */
export function ClassFilesPanel({
  classId,
  initialFiles,
  homework,
  compact = false,
}: {
  classId: string;
  initialFiles?: ClassFile[];
  homework: HomeworkOption[];
  /** Phone layout: one column, bigger touch targets. */
  compact?: boolean;
}) {
  const [files, setFiles] = React.useState<ClassFile[] | null>(initialFiles ?? null);
  const [isPostOpen, setIsPostOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<ClassFile | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (initialFiles) return;
    let cancelled = false;
    listClassFilesAction(classId)
      .then((rows) => !cancelled && setFiles(rows))
      .catch((error: unknown) => {
        if (!cancelled) {
          setFiles([]);
          toast.error(getErrorMessage(error, "Couldn't load the class's files"));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [classId, initialFiles]);

  const homeworkById = new Map(homework.map((item) => [item.id, item]));
  const sorted = sortClassFiles(files ?? []);

  const replace = (file: ClassFile) =>
    setFiles((prev) => (prev ?? []).map((item) => (item.id === file.id ? file : item)));

  const togglePin = async (file: ClassFile) => {
    setBusyId(file.id);
    try {
      replace(await updateClassFileAction(file.id, { pinned: !file.pinned }));
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Couldn't pin the file"));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (file: ClassFile) => {
    if (!window.confirm(`Delete "${file.title}"? Students won't see it any more.`)) return;
    setBusyId(file.id);
    try {
      await deleteClassFileAction(file.id);
      setFiles((prev) => (prev ?? []).filter((item) => item.id !== file.id));
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Couldn't delete the file"));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-2">
      {files === null ? (
        <p className="text-xs text-muted-foreground">Loading files…</p>
      ) : sorted.length === 0 ? (
        <p className="text-xs text-muted-foreground">No files posted to this class.</p>
      ) : (
        sorted.map((file) => {
          const attached = file.homework_id ? homeworkById.get(file.homework_id) : null;
          return (
            <div
              key={file.id}
              className={cn(
                "flex items-start gap-2 rounded-md border px-3 py-2 text-sm",
                file.pinned && "border-brand/40 bg-brand/5",
              )}
            >
              {file.kind === "file" ? (
                <FileTextIcon className="mt-0.5 size-4 shrink-0 text-red-500" aria-hidden="true" />
              ) : (
                <LinkIcon className="mt-0.5 size-4 shrink-0 text-sky-500" aria-hidden="true" />
              )}
              <div className="min-w-0 flex-1">
                <a
                  href={classFileHref(file.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex max-w-full items-center gap-1 font-medium hover:underline"
                >
                  <span className="truncate">{file.title}</span>
                  <ExternalLinkIcon className="size-3 shrink-0 opacity-60" aria-hidden="true" />
                </a>
                {file.note ? <p className="text-xs text-muted-foreground">{file.note}</p> : null}
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span>{format(new Date(file.created_at), "d MMM yyyy")}</span>
                  {file.kind === "file" ? (
                    <span>· PDF {formatFileSize(file.size_bytes)}</span>
                  ) : (
                    <span>· {isGoogleDriveLink(file.url) ? "Google Drive" : "Link"}</span>
                  )}
                  {file.pinned ? (
                    <Badge variant="outline" className="h-5 gap-1 px-1.5 text-[10px]">
                      <PinIcon className="size-2.5" aria-hidden="true" /> Pinned
                    </Badge>
                  ) : null}
                  {attached ? (
                    <Badge variant="secondary" className="h-5 max-w-full px-1.5 text-[10px]">
                      <span className="truncate">Homework: {homeworkLabel(attached.note)}</span>
                    </Badge>
                  ) : null}
                </div>
              </div>
              <div className={cn("flex shrink-0 items-center", compact ? "gap-1" : "gap-0.5")}>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={compact ? "size-9 p-0" : "size-7 p-0"}
                  disabled={busyId === file.id}
                  onClick={() => void togglePin(file)}
                  aria-label={file.pinned ? "Unpin" : "Pin to the top"}
                  title={file.pinned ? "Unpin" : "Pin to the top"}
                >
                  {file.pinned ? <PinOffIcon className="size-3.5" /> : <PinIcon className="size-3.5" />}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={compact ? "size-9 p-0" : "size-7 p-0"}
                  disabled={busyId === file.id}
                  onClick={() => setEditing(file)}
                  aria-label="Edit"
                  title="Edit"
                >
                  <PencilIcon className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={compact ? "size-9 p-0" : "size-7 p-0"}
                  disabled={busyId === file.id}
                  onClick={() => void remove(file)}
                  aria-label="Delete"
                  title="Delete"
                >
                  <Trash2Icon className="size-3.5" />
                </Button>
              </div>
            </div>
          );
        })
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        className={cn("w-full", compact && "h-10")}
        onClick={() => setIsPostOpen(true)}
      >
        <PlusIcon className="size-3.5" aria-hidden="true" />
        Post a file
      </Button>

      <PostFileDialog
        open={isPostOpen}
        onOpenChange={setIsPostOpen}
        classId={classId}
        homework={homework}
        onPosted={(file) => setFiles((prev) => [file, ...(prev ?? [])])}
      />
      <EditFileDialog
        file={editing}
        homework={homework}
        onClose={() => setEditing(null)}
        onSaved={(file) => {
          replace(file);
          setEditing(null);
        }}
      />
    </div>
  );
}

function PostFileDialog({
  open,
  onOpenChange,
  classId,
  homework,
  onPosted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classId: string;
  homework: HomeworkOption[];
  onPosted: (file: ClassFile) => void;
}) {
  const [mode, setMode] = React.useState<"pdf" | "link">("pdf");
  const [picked, setPicked] = React.useState<File | null>(null);
  const [link, setLink] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [note, setNote] = React.useState("");
  const [homeworkId, setHomeworkId] = React.useState("");
  const [notify, setNotify] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const reset = () => {
    setMode("pdf");
    setPicked(null);
    setLink("");
    setTitle("");
    setNote("");
    setHomeworkId("");
    setNotify(true);
    if (inputRef.current) inputRef.current.value = "";
  };

  const pickProblem = picked ? classFileProblem(picked) : null;
  const canPost =
    !saving &&
    (mode === "pdf" ? Boolean(picked) && !pickProblem : Boolean(normalizeLink(link)) && title.trim() !== "");

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canPost) return;
    setSaving(true);
    let uploadedPath: string | null = null;
    try {
      let created: ClassFile;
      if (mode === "pdf" && picked) {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) throw new Error("Not signed in");
        uploadedPath = await uploadClassFile(supabase, user.id, classId, picked);
        created = await createClassFileAction({
          classId,
          storagePath: uploadedPath,
          fileName: picked.name,
          sizeBytes: picked.size,
          title,
          note,
          homeworkId: homeworkId || null,
          notify,
        });
      } else {
        created = await createClassFileAction({
          classId,
          url: link,
          title,
          note,
          homeworkId: homeworkId || null,
          notify,
        });
      }
      onPosted(created);
      toast.success(notify ? "Posted - students notified" : "Posted");
      reset();
      onOpenChange(false);
    } catch (error: unknown) {
      if (uploadedPath) void discardClassFileUploadAction(classId, uploadedPath).catch(() => {});
      toast.error(getErrorMessage(error, "Couldn't post the file"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !saving) reset();
        if (!saving) onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Post a file</DialogTitle>
          <DialogDescription>
            The class&apos;s students and their parents see it in their app.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 text-sm">
            {(["pdf", "link"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setMode(value)}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition",
                  mode === value ? "bg-background shadow-xs" : "text-muted-foreground",
                )}
              >
                {value === "pdf" ? (
                  <FileTextIcon className="size-3.5" aria-hidden="true" />
                ) : (
                  <LinkIcon className="size-3.5" aria-hidden="true" />
                )}
                {value === "pdf" ? "PDF" : "Link"}
              </button>
            ))}
          </div>

          {mode === "pdf" ? (
            <div className="space-y-2">
              <Label htmlFor="class-file-input">PDF file</Label>
              <Input
                ref={inputRef}
                id="class-file-input"
                type="file"
                accept={CLASS_FILE_ACCEPT}
                onChange={(event) => setPicked(event.target.files?.[0] ?? null)}
              />
              <p className={cn("text-xs", pickProblem ? "text-destructive" : "text-muted-foreground")}>
                {pickProblem ??
                  (picked ? `${picked.name} · ${formatFileSize(picked.size)}` : "PDF only, up to 20 MB.")}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="class-file-link">Link</Label>
              <Input
                id="class-file-link"
                type="url"
                inputMode="url"
                value={link}
                onChange={(event) => setLink(event.target.value)}
                placeholder="https://drive.google.com/…"
              />
              <p className="text-xs text-muted-foreground">
                For Google Drive, share the file as &quot;Anyone with the link&quot; first.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="class-file-title">
              Title {mode === "pdf" ? <span className="text-muted-foreground">(optional)</span> : null}
            </Label>
            <Input
              id="class-file-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={mode === "pdf" && picked ? defaultTitle(null, picked.name) : "e.g. Λύσεις κεφ. 3"}
              maxLength={200}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="class-file-note">
              Note <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="class-file-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="e.g. Λύστε τις ασκήσεις 1-5 πριν το μάθημα"
              rows={2}
            />
          </div>
          {homework.length > 0 ? (
            <div className="space-y-2">
              <Label htmlFor="class-file-homework">
                Attach to homework <span className="text-muted-foreground">(optional)</span>
              </Label>
              <select
                id="class-file-homework"
                className={SELECT_CLASS}
                value={homeworkId}
                onChange={(event) => setHomeworkId(event.target.value)}
              >
                <option value="">No - list it with the class&apos;s files</option>
                {homework.map((item) => (
                  <option key={item.id} value={item.id}>
                    {homeworkLabel(item.note)}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <NotifyCheckbox id="class-file-notify" checked={notify} onChange={setNotify} />
          <DialogFooter>
            <Button type="submit" disabled={!canPost}>
              {saving ? (mode === "pdf" ? "Uploading…" : "Posting…") : "Post"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditFileDialog({
  file,
  homework,
  onClose,
  onSaved,
}: {
  file: ClassFile | null;
  homework: HomeworkOption[];
  onClose: () => void;
  onSaved: (file: ClassFile) => void;
}) {
  const [title, setTitle] = React.useState("");
  const [note, setNote] = React.useState("");
  const [homeworkId, setHomeworkId] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [loadedId, setLoadedId] = React.useState<string | null>(null);

  // Fill the form when a different file is opened (derived, not an effect).
  if (file && file.id !== loadedId) {
    setLoadedId(file.id);
    setTitle(file.title);
    setNote(file.note ?? "");
    setHomeworkId(file.homework_id ?? "");
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!file) return;
    setSaving(true);
    try {
      onSaved(
        await updateClassFileAction(file.id, {
          title,
          note,
          homeworkId: homeworkId || null,
        }),
      );
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Couldn't save the file"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={file !== null}
      onOpenChange={(open) => {
        if (!open) {
          setLoadedId(null);
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit file</DialogTitle>
          <DialogDescription>
            Changes show straight away; students aren&apos;t notified again.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-class-file-title">Title</Label>
            <Input
              id="edit-class-file-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={200}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-class-file-note">
              Note <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="edit-class-file-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={2}
            />
          </div>
          {homework.length > 0 || homeworkId ? (
            <div className="space-y-2">
              <Label htmlFor="edit-class-file-homework">Attach to homework</Label>
              <select
                id="edit-class-file-homework"
                className={SELECT_CLASS}
                value={homeworkId}
                onChange={(event) => setHomeworkId(event.target.value)}
              >
                <option value="">No - list it with the class&apos;s files</option>
                {homeworkId && !homework.some((item) => item.id === homeworkId) ? (
                  <option value={homeworkId}>(older homework)</option>
                ) : null}
                {homework.map((item) => (
                  <option key={item.id} value={item.id}>
                    {homeworkLabel(item.note)}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <DialogFooter>
            <Button type="submit" disabled={saving || !title.trim()}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

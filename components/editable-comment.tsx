"use client";

import * as React from "react";
import { PencilIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export type EditableCommentLabels = {
  comment: string;
  addComment: string;
  editComment: string;
  commentPlaceholder: string;
  save: string;
  cancel: string;
};

export const EDITABLE_COMMENT_LABELS: Record<"en" | "el", EditableCommentLabels> = {
  en: {
    comment: "Comment:",
    addComment: "Add comment",
    editComment: "Edit comment",
    commentPlaceholder: "Optional feedback for the student...",
    save: "Save",
    cancel: "Cancel",
  },
  el: {
    comment: "Σχόλιο:",
    addComment: "Προσθήκη σχολίου",
    editComment: "Επεξεργασία σχολίου",
    commentPlaceholder: "Προαιρετικό σχόλιο για τον μαθητή...",
    save: "Αποθήκευση",
    cancel: "Άκυρο",
  },
};

/**
 * One answer's optional teacher comment - read-only text when no onSave is
 * given (the student/parent side), otherwise an inline "add/edit comment"
 * control. Shared between quiz-review-answers.tsx (the per-student "View
 * answers" panel) and the teacher's per-question breakdown view, which
 * render two different answer shapes but both just need "the current
 * comment" in and "the new comment" out.
 */
export function EditableComment({
  comment,
  labels,
  onSave,
}: {
  comment: string | null;
  labels: EditableCommentLabels;
  onSave?: (comment: string | null) => Promise<void> | void;
}) {
  const [isEditing, setIsEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(comment ?? "");
  const [isSaving, setIsSaving] = React.useState(false);

  if (!onSave) {
    return comment ? (
      <p className="mt-2 text-sm italic text-muted-foreground">
        {labels.comment} {comment}
      </p>
    ) : null;
  }

  if (!isEditing) {
    return (
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {comment && (
          <p className="text-sm italic text-muted-foreground">
            {labels.comment} {comment}
          </p>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs text-muted-foreground"
          onClick={() => {
            setDraft(comment ?? "");
            setIsEditing(true);
          }}
        >
          <PencilIcon className="mr-1 h-3 w-3" />
          {comment ? labels.editComment : labels.addComment}
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-2 space-y-2">
      <Textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder={labels.commentPlaceholder}
        rows={2}
        className="text-sm"
        autoFocus
      />
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          disabled={isSaving}
          onClick={async () => {
            setIsSaving(true);
            try {
              await onSave(draft.trim() || null);
              setIsEditing(false);
            } finally {
              setIsSaving(false);
            }
          }}
        >
          {labels.save}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isSaving}
          onClick={() => setIsEditing(false)}
        >
          {labels.cancel}
        </Button>
      </div>
    </div>
  );
}

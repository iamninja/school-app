"use client";

import * as React from "react";
import { PhoneCall } from "lucide-react";

import { getTaskDirectoryAction } from "@/app/protected/teacher/task-actions";
import { ContactMenu } from "@/components/teacher-app/contact-menu";
import { cn } from "@/lib/utils";
import {
  callContacts,
  encodeTitle,
  mentionQuery,
  parseTitle,
  searchDirectory,
  type DirectoryEntry,
  type TagKind,
  type TagRef,
  type TaskDirectory,
} from "@/lib/task-tags";

// Tags in tasks (lib/task-tags.ts), shared by the console's Calendar tab and
// the phone companion: the @ picker input, the chips, and the call button.

// One load per page - every task list on it shares the same directory.
let directoryPromise: Promise<TaskDirectory> | null = null;

export function useTaskDirectory(): TaskDirectory | null {
  const [directory, setDirectory] = React.useState<TaskDirectory | null>(null);
  React.useEffect(() => {
    let active = true;
    directoryPromise ??= Promise.resolve()
      .then(() => getTaskDirectoryAction())
      .catch(() => {
        directoryPromise = null;
        return { entries: [] };
      });
    void directoryPromise.then((loaded) => {
      if (active) setDirectory(loaded);
    });
    return () => {
      active = false;
    };
  }, []);
  return directory;
}

/** For tests: forget the cached directory. */
export function __resetTaskDirectoryForTests() {
  directoryPromise = null;
}

const CHIP_CLASSES: Record<TagKind, string> = {
  student: "bg-sky-500/15 text-sky-800 dark:text-sky-300",
  parent: "bg-pink-500/15 text-pink-800 dark:text-pink-300",
  class: "bg-teal-500/15 text-teal-800 dark:text-teal-300",
};

const KIND_LABELS: Record<TagKind, string> = {
  student: "Student",
  parent: "Parent",
  class: "Class",
};

/**
 * A task's text with its tags as chips - each showing the current name,
 * or the name at the time (greyed) if that person or class is gone.
 */
export function TaskTitle({
  title,
  directory,
}: {
  title: string;
  directory: TaskDirectory | null;
}) {
  const byKey = React.useMemo(
    () => new Map((directory?.entries ?? []).map((entry) => [`${entry.kind}:${entry.id}`, entry])),
    [directory],
  );
  return (
    <>
      {parseTitle(title).map((segment, index) => {
        if (segment.type === "text") return <React.Fragment key={index}>{segment.text}</React.Fragment>;
        const { tag } = segment;
        const current = byKey.get(`${tag.kind}:${tag.id}`);
        const gone = directory !== null && !current;
        return (
          <span
            key={index}
            title={gone ? "No longer in your school" : KIND_LABELS[tag.kind]}
            className={cn(
              "mx-0.5 inline-flex items-center rounded-full px-1.5 align-baseline text-[0.85em] font-medium no-underline",
              gone ? "bg-muted text-muted-foreground" : CHIP_CLASSES[tag.kind],
            )}
          >
            @{current?.name ?? tag.label}
          </span>
        );
      })}
    </>
  );
}

/**
 * A call task's 📞: one number rings straight away on the phone; several
 * (a student's family) open the Call / SMS / Viber / WhatsApp menu. The
 * console always opens the menu, which shows the numbers.
 */
export function CallButton({
  title,
  directory,
  direct = false,
}: {
  title: string;
  directory: TaskDirectory | null;
  /** Phone: ring a single number without the menu. */
  direct?: boolean;
}) {
  if (!directory) return null;
  const contacts = callContacts(title, directory);
  if (contacts.length === 0) return null;
  if (direct && contacts.length === 1) {
    return (
      <a
        href={`tel:${contacts[0].phone}`}
        aria-label={`Call ${contacts[0].name}`}
        className="flex size-9 shrink-0 items-center justify-center rounded-md bg-emerald-600 text-white active:bg-emerald-700"
      >
        <PhoneCall className="size-4" aria-hidden="true" />
      </a>
    );
  }
  return (
    <ContactMenu
      studentName={contacts[0].name}
      contacts={contacts}
      triggerClassName="bg-emerald-600 text-white hover:bg-emerald-700 hover:text-white"
    />
  );
}

/** The text being typed and the tags picked into it. */
export interface TaggedDraft {
  text: string;
  picked: TagRef[];
}

export const EMPTY_DRAFT: TaggedDraft = { text: "", picked: [] };

/** What to store for a draft: its "@Name"s turned into tag tokens. */
export function draftTitle(draft: TaggedDraft): string {
  return encodeTitle(draft.text, draft.picked);
}

function entryLabel(entry: DirectoryEntry): string {
  return entry.name;
}

/**
 * A task text field with an @ picker: typing "@" lists matching students,
 * parents and classes (accent- and case-insensitive); Enter, Tab or a tap
 * picks one; Escape closes the list.
 */
export function TaskTextInput({
  draft,
  onDraftChange,
  directory,
  className,
  ...inputProps
}: {
  draft: TaggedDraft;
  onDraftChange: (draft: TaggedDraft) => void;
  directory: TaskDirectory | null;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [caret, setCaret] = React.useState(0);
  const [active, setActive] = React.useState(0);
  const [dismissed, setDismissed] = React.useState(false);
  const listId = React.useId();

  const mention = mentionQuery(draft.text, caret);
  const matches =
    mention && directory && !dismissed ? searchDirectory(directory, mention.query) : [];
  const open = matches.length > 0;

  const pick = (entry: DirectoryEntry) => {
    if (!mention) return;
    const label = entryLabel(entry);
    const before = draft.text.slice(0, mention.start);
    const after = draft.text.slice(caret);
    const inserted = `@${label} `;
    const text = before + inserted + after.replace(/^\s+/, "");
    onDraftChange({
      text,
      picked: [...draft.picked, { kind: entry.kind, id: entry.id, label }],
    });
    const nextCaret = before.length + inserted.length;
    setCaret(nextCaret);
    setActive(0);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(nextCaret, nextCaret);
    });
  };

  return (
    <div className="relative min-w-0 flex-1">
      <input
        ref={inputRef}
        {...inputProps}
        value={draft.text}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        className={className}
        onChange={(event) => {
          setCaret(event.target.selectionStart ?? event.target.value.length);
          setDismissed(false);
          setActive(0);
          onDraftChange({ ...draft, text: event.target.value });
        }}
        onSelect={(event) => setCaret(event.currentTarget.selectionStart ?? 0)}
        onKeyDown={(event) => {
          if (!open) return;
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            const step = event.key === "ArrowDown" ? 1 : -1;
            setActive((value) => (value + step + matches.length) % matches.length);
          } else if (event.key === "Enter" || event.key === "Tab") {
            event.preventDefault();
            pick(matches[Math.min(active, matches.length - 1)]);
          } else if (event.key === "Escape") {
            event.preventDefault();
            setDismissed(true);
          }
        }}
        onBlur={() => setTimeout(() => setDismissed(true), 150)}
        onFocus={() => setDismissed(false)}
      />
      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-lg"
        >
          {matches.map((entry, index) => (
            <li
              key={`${entry.kind}:${entry.id}`}
              role="option"
              aria-selected={index === active}
              onMouseDown={(event) => {
                event.preventDefault();
                pick(entry);
              }}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm",
                index === active && "bg-accent",
              )}
            >
              <span className={cn("shrink-0 rounded-full px-1.5 text-[10px] font-semibold uppercase", CHIP_CLASSES[entry.kind])}>
                {KIND_LABELS[entry.kind]}
              </span>
              <span className="min-w-0 flex-1 truncate">
                {entry.name}
                {entry.detail && (
                  <span className="ml-1.5 text-xs text-muted-foreground">{entry.detail}</span>
                )}
              </span>
              {entry.phone && <PhoneCall className="size-3.5 shrink-0 text-muted-foreground" aria-label="Has a phone number" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The "📞 Call" toggle beside a task field. */
export function CallToggle({
  pressed,
  onPressedChange,
  className,
}: {
  pressed: boolean;
  onPressedChange: (pressed: boolean) => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label="Call task"
      title="Call task - a call button for the people you tag"
      onClick={() => onPressedChange(!pressed)}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-md border",
        pressed
          ? "border-emerald-600 bg-emerald-600 text-white"
          : "border-border bg-background text-muted-foreground",
        className,
      )}
    >
      <PhoneCall className="size-4" aria-hidden="true" />
    </button>
  );
}

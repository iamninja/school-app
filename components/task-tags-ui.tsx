"use client";

import * as React from "react";
import { BookUser, Mail, PhoneCall, UserPlus } from "lucide-react";

import {
  createContactAction,
  getTaskDirectoryAction,
} from "@/app/protected/teacher/task-actions";
import { ContactMenu } from "@/components/teacher-app/contact-menu";
import { cn } from "@/lib/utils";
import {
  callContacts,
  encodeTitle,
  mailtoHref,
  mentionQuery,
  parseTitle,
  searchDirectory,
  tagText,
  type DirectoryEntry,
  type TagKind,
  type TagRef,
  type TaskDirectory,
} from "@/lib/task-tags";
import { getErrorMessage } from "@/lib/expected-error";
import type { TeacherContact } from "@/lib/teacher-contacts";

// Tags in tasks (lib/task-tags.ts), shared by the console's Calendar tab and
// the phone companion: the picker input (@ people, + contacts, # tests /
// homework / quizzes), the chips, and the call and email buttons.

// One load per page - every task list on it shares the same directory. A
// contact added from the picker joins it at once, for every list.
let directoryPromise: Promise<TaskDirectory> | null = null;
let directoryValue: TaskDirectory | null = null;
const directoryListeners = new Set<(directory: TaskDirectory) => void>();

function publishDirectory(directory: TaskDirectory) {
  directoryValue = directory;
  for (const listener of directoryListeners) listener(directory);
}

export function useTaskDirectory(): TaskDirectory | null {
  const [directory, setDirectory] = React.useState<TaskDirectory | null>(directoryValue);
  React.useEffect(() => {
    directoryListeners.add(setDirectory);
    directoryPromise ??= Promise.resolve()
      .then(() => getTaskDirectoryAction())
      .then((loaded) => {
        publishDirectory(loaded);
        return loaded;
      })
      .catch(() => {
        directoryPromise = null;
        return { entries: [] };
      });
    void directoryPromise.then((loaded) => setDirectory(directoryValue ?? loaded));
    return () => {
      directoryListeners.delete(setDirectory);
    };
  }, []);
  return directory;
}

/** A contact made or edited elsewhere (the Business tab, the picker) - into the shared directory. */
export function upsertDirectoryContact(contact: TeacherContact) {
  if (!directoryValue) return;
  const entry: DirectoryEntry = {
    kind: "contact",
    id: contact.id,
    name: contact.name,
    detail: contact.label ?? "",
    phone: contact.phone,
    email: contact.email,
    familyId: null,
    isPrimary: false,
  };
  publishDirectory({
    entries: [...directoryValue.entries.filter((item) => !(item.kind === "contact" && item.id === contact.id)), entry],
  });
}

/** For tests: forget the cached directory. */
export function __resetTaskDirectoryForTests() {
  directoryPromise = null;
  directoryValue = null;
}

const CHIP_CLASSES: Record<TagKind, string> = {
  student: "bg-sky-500/15 text-sky-800 dark:text-sky-300",
  parent: "bg-pink-500/15 text-pink-800 dark:text-pink-300",
  class: "bg-teal-500/15 text-teal-800 dark:text-teal-300",
  contact: "bg-orange-500/15 text-orange-800 dark:text-orange-300",
  assessment: "bg-indigo-500/15 text-indigo-800 dark:text-indigo-300",
  homework: "bg-lime-500/20 text-lime-900 dark:text-lime-300",
  quiz: "bg-fuchsia-500/15 text-fuchsia-800 dark:text-fuchsia-300",
};

const KIND_LABELS: Record<TagKind, string> = {
  student: "Student",
  parent: "Parent",
  class: "Class",
  contact: "Contact",
  assessment: "Test",
  homework: "Homework",
  quiz: "Quiz",
};

/**
 * Where a # tag (test, homework, quiz) opens. The phone links to its own
 * screens (the default below); the console switches its tab in place.
 */
export type TagOpener = {
  href?: (tag: TagRef, entry: DirectoryEntry | undefined) => string | null;
  open?: (tag: TagRef, entry: DirectoryEntry | undefined) => void;
};

/** The companion's screens; a quiz has none there, so it opens the console's Quizzes tab. */
export function companionTagHref(tag: TagRef, entry: DirectoryEntry | undefined): string | null {
  if (tag.kind === "assessment") return `/teacher-app/assessments/${tag.id}`;
  if (tag.kind === "homework") {
    return entry?.classId ? `/teacher-app/homework?class=${entry.classId}` : "/teacher-app/homework";
  }
  if (tag.kind === "quiz") return "/protected/teacher?section=quizzes";
  return null;
}

const TagOpenerContext = React.createContext<TagOpener>({ href: companionTagHref });

export function TagOpenerProvider({
  value,
  children,
}: {
  value: TagOpener;
  children: React.ReactNode;
}) {
  return <TagOpenerContext.Provider value={value}>{children}</TagOpenerContext.Provider>;
}

const ITEM_KINDS: ReadonlySet<TagKind> = new Set(["assessment", "homework", "quiz"]);

/**
 * A task's text with its tags as chips - each showing the current name,
 * or the name at the time (greyed) if that person, contact or item is gone.
 * A test, homework or quiz chip opens it.
 */
export function TaskTitle({
  title,
  directory,
}: {
  title: string;
  directory: TaskDirectory | null;
}) {
  const opener = React.useContext(TagOpenerContext);
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
        // Old tests and homework drop out of the picker's list but still exist:
        // only people and contacts read as gone.
        const gone = directory !== null && !current && !ITEM_KINDS.has(tag.kind);
        const text = tagText({ kind: tag.kind, label: current?.name ?? tag.label });
        const className = cn(
          "mx-0.5 inline-flex items-center rounded-full px-1.5 align-baseline text-[0.85em] font-medium no-underline",
          gone ? "bg-muted text-muted-foreground" : CHIP_CLASSES[tag.kind],
        );
        if (ITEM_KINDS.has(tag.kind)) {
          const label = `Open ${KIND_LABELS[tag.kind].toLowerCase()} ${current?.name ?? tag.label}`;
          if (opener.open) {
            return (
              <button
                key={index}
                type="button"
                aria-label={label}
                onClick={(event) => {
                  // A chip inside a checkbox's label mustn't tick the task.
                  event.preventDefault();
                  event.stopPropagation();
                  opener.open!(tag, current);
                }}
                className={cn(className, "underline-offset-2 hover:underline")}
              >
                {text}
              </button>
            );
          }
          const href = opener.href?.(tag, current);
          if (href) {
            return (
              <a
                key={index}
                href={href}
                aria-label={label}
                onClick={(event) => event.stopPropagation()}
                className={cn(className, "underline-offset-2 hover:underline")}
              >
                {text}
              </a>
            );
          }
        }
        return (
          <span
            key={index}
            title={gone ? "No longer in your school" : KIND_LABELS[tag.kind]}
            className={className}
          >
            {text}
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

/**
 * An email task's ✉️: opens the mail app to everyone tagged who has an
 * address (a student's parents too), with the task's words as the subject.
 */
export function EmailButton({
  title,
  directory,
  className,
}: {
  title: string;
  directory: TaskDirectory | null;
  className?: string;
}) {
  if (!directory) return null;
  const href = mailtoHref(title, directory);
  if (!href) return null;
  return (
    <a
      href={href}
      aria-label="Write the email"
      title="Write the email"
      className={cn(
        "flex shrink-0 items-center justify-center rounded-md bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-700",
        className ?? "size-9",
      )}
    >
      <Mail className="size-4" aria-hidden="true" />
    </a>
  );
}

/** The text being typed and the tags picked into it. */
export interface TaggedDraft {
  text: string;
  picked: TagRef[];
}

export const EMPTY_DRAFT: TaggedDraft = { text: "", picked: [] };

/** What to store for a draft: its "@Name"s (and "+", "#") turned into tag tokens. */
export function draftTitle(draft: TaggedDraft): string {
  return encodeTitle(draft.text, draft.picked);
}

type PickerRow = { type: "entry"; entry: DirectoryEntry } | { type: "new-contact" };

/**
 * A task text field with a picker: "@" lists matching students, parents
 * and classes, "+" outside contacts (and "New contact"), "#" tests,
 * homework and quizzes - accent- and case-insensitive. Enter, Tab or a tap
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
  // "New contact": the mention it will replace, while the little form is open.
  const [creating, setCreating] = React.useState<{ start: number; end: number; query: string } | null>(null);
  const listId = React.useId();

  const mention = mentionQuery(draft.text, caret);
  const matches =
    mention && directory && !dismissed && !creating
      ? searchDirectory(directory, mention.query, mention.marker)
      : [];
  // "+3021…" is a number being typed, not a contact search.
  const offerNewContact =
    mention?.marker === "+" && directory !== null && !dismissed && !creating && !/^\d/.test(mention.query);
  const rows: PickerRow[] = [
    ...matches.map((entry) => ({ type: "entry" as const, entry })),
    ...(offerNewContact ? [{ type: "new-contact" as const }] : []),
  ];
  const open = rows.length > 0;

  const insert = (entry: DirectoryEntry, range: { start: number; end: number }) => {
    const label = entry.name;
    const before = draft.text.slice(0, range.start);
    const after = draft.text.slice(range.end);
    const inserted = `${tagText({ kind: entry.kind, label })} `;
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

  const choose = (row: PickerRow) => {
    if (!mention) return;
    if (row.type === "entry") {
      insert(row.entry, { start: mention.start, end: caret });
    } else {
      setCreating({ start: mention.start, end: caret, query: mention.query });
    }
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
            setActive((value) => (value + step + rows.length) % rows.length);
          } else if (event.key === "Enter" || event.key === "Tab") {
            event.preventDefault();
            choose(rows[Math.min(active, rows.length - 1)]);
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
          {rows.map((row, index) => (
            <li
              key={row.type === "entry" ? `${row.entry.kind}:${row.entry.id}` : "new-contact"}
              role="option"
              aria-selected={index === active}
              onMouseDown={(event) => {
                event.preventDefault();
                choose(row);
              }}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm",
                index === active && "bg-accent",
              )}
            >
              {row.type === "entry" ? (
                <>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-1.5 text-[10px] font-semibold uppercase",
                      CHIP_CLASSES[row.entry.kind],
                    )}
                  >
                    {KIND_LABELS[row.entry.kind]}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {row.entry.name}
                    {row.entry.detail && (
                      <span className="ml-1.5 text-xs text-muted-foreground">{row.entry.detail}</span>
                    )}
                  </span>
                  {row.entry.phone && (
                    <PhoneCall className="size-3.5 shrink-0 text-muted-foreground" aria-label="Has a phone number" />
                  )}
                  {row.entry.email && (
                    <Mail className="size-3.5 shrink-0 text-muted-foreground" aria-label="Has an email" />
                  )}
                </>
              ) : (
                <>
                  <UserPlus className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate font-medium">
                    New contact{mention?.query ? ` "${mention.query}"` : ""}
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {creating && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-md border border-border bg-popover p-3 text-popover-foreground shadow-lg">
          <ContactForm
            initial={{ name: creating.query }}
            submitLabel="Add and tag"
            onCancel={() => {
              setCreating(null);
              requestAnimationFrame(() => inputRef.current?.focus());
            }}
            onSaved={(contact) => {
              upsertDirectoryContact(contact);
              const range = creating;
              setCreating(null);
              insert(
                {
                  kind: "contact",
                  id: contact.id,
                  name: contact.name,
                  detail: contact.label ?? "",
                  phone: contact.phone,
                  email: contact.email,
                  familyId: null,
                  isPrimary: false,
                },
                range,
              );
            }}
          />
        </div>
      )}
    </div>
  );
}

// --- Contacts form ---------------------------------------------------------------

type PickedContact = { name?: string[]; tel?: string[]; email?: string[] };
type ContactsManager = {
  select: (properties: string[], options?: { multiple?: boolean }) => Promise<PickedContact[]>;
};

const noSubscribe = () => () => {};

/** Android Chrome's Contact Picker - absent on iPhone and desktop browsers. */
export function phonebook(): ContactsManager | null {
  if (typeof navigator === "undefined") return null;
  const contacts = (navigator as Navigator & { contacts?: ContactsManager }).contacts;
  return contacts && typeof contacts.select === "function" ? contacts : null;
}

export interface ContactFormValues {
  name: string;
  label: string;
  phone: string;
  email: string;
}

/**
 * Name, label, phone, email - with "From phonebook" where the browser can
 * open the phone's contacts. Saves through createContactAction unless an
 * onSubmit is given (the Business tab edits through its own).
 */
export function ContactForm({
  initial,
  submitLabel = "Save",
  onSubmit,
  onSaved,
  onCancel,
}: {
  initial?: Partial<ContactFormValues>;
  submitLabel?: string;
  onSubmit?: (values: ContactFormValues) => Promise<TeacherContact>;
  onSaved: (contact: TeacherContact) => void;
  onCancel: () => void;
}) {
  const [values, setValues] = React.useState<ContactFormValues>({
    name: initial?.name ?? "",
    label: initial?.label ?? "",
    phone: initial?.phone ?? "",
    email: initial?.email ?? "",
  });
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  // Browser-only: false on the server render, then whatever this browser can do.
  const canPick = React.useSyncExternalStore(
    noSubscribe,
    () => phonebook() !== null,
    () => false,
  );
  const nameId = React.useId();

  const set = (key: keyof ContactFormValues) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setValues((prev) => ({ ...prev, [key]: event.target.value }));

  const pick = async () => {
    try {
      const [picked] = (await phonebook()?.select(["name", "tel", "email"])) ?? [];
      if (!picked) return;
      setValues((prev) => ({
        ...prev,
        name: picked.name?.[0] ?? prev.name,
        phone: picked.tel?.[0] ?? prev.phone,
        email: picked.email?.[0] ?? prev.email,
      }));
    } catch {
      // Closed without picking, or not allowed - nothing to fill in.
    }
  };

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      const saved = onSubmit
        ? await onSubmit(values)
        : await createContactAction({
            name: values.name,
            label: values.label,
            phone: values.phone,
            email: values.email,
          });
      onSaved(saved);
    } catch (caught) {
      setError(getErrorMessage(caught, "Couldn't save the contact"));
    } finally {
      setSaving(false);
    }
  };

  const field =
    "h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm placeholder:text-muted-foreground";
  // Not a <form>: it can sit inside a task's add form.
  return (
    <div
      className="space-y-2"
      role="group"
      aria-labelledby={nameId}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          void submit();
        } else if (event.key === "Escape") {
          event.preventDefault();
          onCancel();
        }
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <p id={nameId} className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Contact
        </p>
        {canPick && (
          <button
            type="button"
            onClick={() => void pick()}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-muted"
          >
            <BookUser className="size-3.5" aria-hidden="true" />
            From phonebook
          </button>
        )}
      </div>
      <input aria-label="Name" placeholder="Name" value={values.name} onChange={set("name")} autoFocus className={field} />
      <input aria-label="Label" placeholder="Label - e.g. Supplier" value={values.label} onChange={set("label")} className={field} />
      <div className="grid grid-cols-2 gap-2">
        <input aria-label="Phone" placeholder="Phone" type="tel" inputMode="tel" value={values.phone} onChange={set("phone")} className={field} />
        <input aria-label="Email" placeholder="Email" type="email" inputMode="email" value={values.email} onChange={set("email")} className={field} />
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="h-8 rounded-md px-3 text-sm text-muted-foreground hover:bg-muted">
          Cancel
        </button>
        <button
          type="button"
          disabled={saving || !values.name.trim()}
          onClick={() => void submit()}
          className="h-8 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {submitLabel}
        </button>
      </div>
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

/** The "✉️ Email" toggle beside a task field. */
export function EmailToggle({
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
      aria-label="Email task"
      title="Email task - a mail button for the people you tag"
      onClick={() => onPressedChange(!pressed)}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-md border",
        pressed
          ? "border-blue-600 bg-blue-600 text-white"
          : "border-border bg-background text-muted-foreground",
        className,
      )}
    >
      <Mail className="size-4" aria-hidden="true" />
    </button>
  );
}


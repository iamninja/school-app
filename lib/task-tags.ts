// Tags inside a task's text (lib/teacher-tasks.ts): "@Ελένη" picked from
// the @ picker is stored as the token @[Ελένη](parent:<uuid>) - the name at
// the time plus the id, so the current name and phone can be looked up when
// the task is shown, and the old name still reads if the person is deleted.
// Pure - shared by the console, the companion and the server's validation.

export type TagKind = "student" | "parent" | "class";

export interface TagRef {
  kind: TagKind;
  id: string;
  /** The name when the tag was made (what the chip falls back to). */
  label: string;
}

export type TitleSegment = { type: "text"; text: string } | { type: "tag"; tag: TagRef };

const TOKEN = /@\[([^\]\n]{1,80})\]\((student|parent|class):([0-9a-f-]{36})\)/g;

/** The token for one tag. Brackets in a name are dropped so the token stays parseable. */
export function tagToken(tag: TagRef): string {
  const label = tag.label.replace(/[[\]()\n]/g, "").trim().slice(0, 80) || "?";
  return `@[${label}](${tag.kind}:${tag.id})`;
}

/** Text and tags, in order. */
export function parseTitle(title: string): TitleSegment[] {
  const segments: TitleSegment[] = [];
  let last = 0;
  for (const match of title.matchAll(TOKEN)) {
    if (match.index > last) segments.push({ type: "text", text: title.slice(last, match.index) });
    segments.push({
      type: "tag",
      tag: { label: match[1], kind: match[2] as TagKind, id: match[3] },
    });
    last = match.index + match[0].length;
  }
  if (last < title.length) segments.push({ type: "text", text: title.slice(last) });
  return segments;
}

export function tagsIn(title: string): TagRef[] {
  return parseTitle(title)
    .filter((segment): segment is { type: "tag"; tag: TagRef } => segment.type === "tag")
    .map((segment) => segment.tag);
}

/** The title as read: "Πάρε τηλέφωνο @Ελένη" - for lengths, search and aria labels. */
export function plainTitle(title: string): string {
  return parseTitle(title)
    .map((segment) => (segment.type === "text" ? segment.text : `@${segment.tag.label}`))
    .join("");
}

/**
 * What the input shows -> what is stored: each tag picked from the picker
 * becomes a token where its "@Label" still stands in the text. A tag the
 * teacher deleted from the text is dropped; one typed by hand without
 * picking stays plain text.
 */
export function encodeTitle(text: string, picked: TagRef[]): string {
  let result = text;
  // Longest first, so "@Μαρία Παπαδοπούλου" wins over "@Μαρία".
  for (const tag of [...picked].sort((a, b) => b.label.length - a.label.length)) {
    const needle = `@${tag.label}`;
    const at = indexOutsideTokens(result, needle);
    if (at === -1) continue;
    result = result.slice(0, at) + tagToken(tag) + result.slice(at + needle.length);
  }
  return result;
}

function indexOutsideTokens(text: string, needle: string): number {
  const tokens = [...text.matchAll(TOKEN)].map((m) => [m.index, m.index + m[0].length]);
  let from = 0;
  for (;;) {
    const at = text.indexOf(needle, from);
    if (at === -1) return -1;
    if (!tokens.some(([start, end]) => at >= start && at < end)) return at;
    from = at + 1;
  }
}

/** Lowercase, no accents: "Ελένη" and "ελενη" match, as do "Ά" and "α". */
export function searchKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLocaleLowerCase("el")
    .replace(/ς/g, "σ");
}

/** The "@query" being typed just before the caret, if any. */
export function mentionQuery(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const match = /(^|\s)@([^\s@]{0,30})$/.exec(before);
  if (!match) return null;
  return { start: caret - match[2].length - 1, query: match[2] };
}

// --- The @ picker's directory -------------------------------------------------

export interface DirectoryEntry {
  kind: TagKind;
  id: string;
  name: string;
  /** "Β Λυκείου" for a student, "μητέρα της Μαρίας" style for a parent. */
  detail: string;
  /** E.164, when there is a usable number. */
  phone: string | null;
  /** Students and parents: their family, for "call the family". */
  familyId: string | null;
  /** Parents: the family's primary contact. */
  isPrimary: boolean;
}

export interface TaskDirectory {
  entries: DirectoryEntry[];
}

/** Best matches for "@query": names starting with it first, then containing it. */
export function searchDirectory(
  directory: TaskDirectory,
  query: string,
  limit = 8,
): DirectoryEntry[] {
  const key = searchKey(query.trim());
  const scored = directory.entries
    .map((entry) => {
      const name = searchKey(entry.name);
      const words = name.split(/\s+/);
      const score = !key
        ? 2
        : name.startsWith(key)
          ? 0
          : words.some((word) => word.startsWith(key))
            ? 1
            : name.includes(key) || searchKey(entry.detail).includes(key)
              ? 2
              : -1;
      return { entry, score };
    })
    .filter((item) => item.score >= 0);
  const kindOrder: Record<TagKind, number> = { student: 0, parent: 1, class: 2 };
  scored.sort(
    (a, b) =>
      a.score - b.score ||
      kindOrder[a.entry.kind] - kindOrder[b.entry.kind] ||
      a.entry.name.localeCompare(b.entry.name, "el"),
  );
  return scored.slice(0, limit).map((item) => item.entry);
}

export interface CallContact {
  name: string;
  role: "parent" | "student";
  /** E.164. */
  phone: string;
}

/**
 * Who a call task's button rings: a tagged parent directly; a tagged
 * student's whole family - parents (primary first), then the student.
 * Deduped by number; a person tagged twice is listed once.
 */
export function callContacts(title: string, directory: TaskDirectory): CallContact[] {
  const byKey = new Map(directory.entries.map((entry) => [`${entry.kind}:${entry.id}`, entry]));
  const contacts: CallContact[] = [];
  const seen = new Set<string>();
  const add = (entry: DirectoryEntry, role: CallContact["role"]) => {
    if (!entry.phone || seen.has(entry.phone)) return;
    seen.add(entry.phone);
    contacts.push({ name: entry.name, role, phone: entry.phone });
  };

  for (const tag of tagsIn(title)) {
    const entry = byKey.get(`${tag.kind}:${tag.id}`);
    if (!entry) continue;
    if (entry.kind === "parent") add(entry, "parent");
    if (entry.kind === "student") {
      directory.entries
        .filter((other) => other.kind === "parent" && other.familyId !== null && other.familyId === entry.familyId)
        .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))
        .forEach((parent) => add(parent, "parent"));
      add(entry, "student");
    }
  }
  return contacts;
}

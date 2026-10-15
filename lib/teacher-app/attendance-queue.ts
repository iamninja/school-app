import type { AttendanceStatus } from "@/lib/attendance-records";

/**
 * Attendance marks tapped while the phone had no signal, kept in
 * localStorage until they can be sent. One entry per student/lesson - a
 * later tap replaces an earlier one, and "" means "clear the mark". Read
 * with useSyncExternalStore (subscribe / getSnapshot).
 *
 * localStorage can throw or be empty (private mode, cleared site data), so
 * every access is guarded; at worst the queue behaves as if empty.
 */

export type QueuedMark = {
  classId: string;
  className: string;
  date: string;
  studentId: string;
  studentName: string;
  status: AttendanceStatus | "";
  queuedAt: number;
};

export const ATTENDANCE_QUEUE_KEY = "modus-attendance-queue";

const EMPTY: QueuedMark[] = [];
let cache: QueuedMark[] | null = null;
const listeners = new Set<() => void>();

export function markKey(mark: Pick<QueuedMark, "classId" | "date" | "studentId">): string {
  return `${mark.classId}|${mark.date}|${mark.studentId}`;
}

function isQueuedMark(value: unknown): value is QueuedMark {
  const mark = value as QueuedMark;
  return (
    typeof mark === "object" &&
    mark !== null &&
    typeof mark.classId === "string" &&
    typeof mark.className === "string" &&
    typeof mark.date === "string" &&
    typeof mark.studentId === "string" &&
    typeof mark.studentName === "string" &&
    typeof mark.status === "string" &&
    typeof mark.queuedAt === "number"
  );
}

function read(): QueuedMark[] {
  try {
    const raw = window.localStorage.getItem(ATTENDANCE_QUEUE_KEY);
    if (!raw) return EMPTY;
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isQueuedMark) : EMPTY;
  } catch {
    return EMPTY;
  }
}

function write(marks: QueuedMark[]) {
  cache = marks;
  try {
    if (marks.length === 0) window.localStorage.removeItem(ATTENDANCE_QUEUE_KEY);
    else window.localStorage.setItem(ATTENDANCE_QUEUE_KEY, JSON.stringify(marks));
  } catch {
    // Storage unavailable: the queue still works for this page's lifetime.
  }
  for (const listener of listeners) listener();
}

export function getQueueSnapshot(): QueuedMark[] {
  if (cache === null) cache = read();
  return cache;
}

export function getServerQueueSnapshot(): QueuedMark[] {
  return EMPTY;
}

export function subscribeToQueue(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === ATTENDANCE_QUEUE_KEY) {
      cache = read();
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function enqueueMark(mark: QueuedMark) {
  const key = markKey(mark);
  write([...getQueueSnapshot().filter((entry) => markKey(entry) !== key), mark]);
}

/** Drops the queued mark for this student/lesson (a newer direct save wins). */
export function dropQueuedMark(mark: Pick<QueuedMark, "classId" | "date" | "studentId">) {
  const key = markKey(mark);
  const queue = getQueueSnapshot();
  if (queue.some((entry) => markKey(entry) === key)) {
    write(queue.filter((entry) => markKey(entry) !== key));
  }
}

/** Removes exactly this entry - not a newer tap queued while it was sending. */
function removeSent(mark: QueuedMark) {
  write(
    getQueueSnapshot().filter(
      (entry) => !(markKey(entry) === markKey(mark) && entry.queuedAt === mark.queuedAt),
    ),
  );
}

/**
 * A save that failed because the request never got through (no signal,
 * dropped connection, a captive-portal page instead of our server) - as
 * opposed to the server refusing it, which retrying won't fix.
 */
export function isNetworkError(error: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  // A digest means the server answered with an error (an ExpectedError or a
  // masked one) - the request did get through.
  const digest =
    typeof error === "object" && error !== null
      ? (error as { digest?: unknown }).digest
      : undefined;
  if (typeof digest === "string") return false;
  if (error instanceof TypeError) return true;
  const message = error instanceof Error ? error.message : "";
  return /failed to fetch|network|load failed|unexpected response/i.test(message);
}

export type SendMark = (data: {
  classId: string;
  className: string;
  studentId: string;
  attendanceDate: string;
  status: AttendanceStatus | "";
}) => Promise<unknown>;

export type FlushResult = {
  sent: number;
  /** Refused by the server (e.g. the student left the class) - dropped. */
  rejected: { mark: QueuedMark; error: unknown }[];
  /** Still no signal; the rest stays queued. */
  offline: boolean;
};

let flushing: Promise<FlushResult> | null = null;

/**
 * Sends queued marks one at a time, oldest first. Stops at the first
 * network failure (everything after it would fail too). Concurrent calls
 * share one run.
 */
export function flushQueue(send: SendMark): Promise<FlushResult> {
  if (flushing) return flushing;
  flushing = (async () => {
    const result: FlushResult = { sent: 0, rejected: [], offline: false };
    const pending = [...getQueueSnapshot()].sort((a, b) => a.queuedAt - b.queuedAt);
    for (const mark of pending) {
      try {
        await send({
          classId: mark.classId,
          className: mark.className,
          studentId: mark.studentId,
          attendanceDate: mark.date,
          status: mark.status,
        });
        removeSent(mark);
        result.sent += 1;
      } catch (error) {
        if (isNetworkError(error)) {
          result.offline = true;
          break;
        }
        removeSent(mark);
        result.rejected.push({ mark, error });
      }
    }
    return result;
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}

/** Tests only: forget the in-memory copy so the next read hits storage. */
export function __resetAttendanceQueueForTests() {
  cache = null;
  flushing = null;
  listeners.clear();
}

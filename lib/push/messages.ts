/**
 * The catalogue of every notification Modus sends: its default Greek text,
 * which placeholders the text may use, where tapping it leads, and which App
 * tab switch controls it. Pure - no server imports - so the App tab can use
 * it for the live preview too.
 *
 * Placeholders are written in English ({class}, {date}) so they read the
 * same whatever language the text is in; their values are filled in Greek.
 * Money notices deliberately offer no amount placeholder: whatever the
 * teacher types, an amount can't end up on a lock screen.
 */

export const PLACEHOLDERS = {
  class: { label: "class name", sample: "Β' Λυκείου" },
  date: { label: "date", sample: "14/10" },
  time: { label: "time", sample: "17:00" },
  new_date: { label: "new date", sample: "16/10" },
  new_time: { label: "new time", sample: "18:00" },
  student: { label: "student name", sample: "Μαρία" },
  title: { label: "quiz/test title", sample: "Παράγωγοι" },
  due_date: { label: "due date", sample: "16/10" },
  note: { label: "homework text", sample: "σελ. 42, ασκ. 1-10" },
  receipt: { label: "receipt number", sample: "Α-5" },
  month: { label: "month", sample: "Οκτώβριος" },
} as const;

export type Placeholder = keyof typeof PLACEHOLDERS;
export type MessageValues = Partial<Record<Placeholder, string | null | undefined>>;

/** The App tab switch (a notification_settings column) behind each event. */
export type NotificationSwitch =
  | "homework"
  | "homework_reminders"
  | "quizzes"
  | "quiz_reminders"
  | "assessments"
  | "test_reminders"
  | "lesson_changes"
  | "marks"
  | "absences"
  | "receipts"
  | "monthly_charges"
  | "balance_reminder"
  | "teacher_quiz_review"
  | "teacher_charge_failed"
  | "teacher_mydata_failed";

export type EventGroup = "school" | "money" | "teacher";

export type EventDefinition = {
  label: string;
  group: EventGroup;
  switch: NotificationSwitch;
  title: string;
  body: string;
  placeholders: readonly Placeholder[];
  url: string;
};

const STUDENT_URL = "/student-dashboard";
const PARENT_URL = "/parent-dashboard";
const TEACHER_URL = "/protected/teacher";

export const EVENTS = {
  homework: {
    label: "New homework",
    group: "school",
    switch: "homework",
    title: "Νέα εργασία · {class}",
    body: "{note}",
    placeholders: ["class", "note", "due_date"],
    url: STUDENT_URL,
  },
  homework_reminder: {
    label: "Homework reminder",
    group: "school",
    switch: "homework_reminders",
    title: "Υπενθύμιση εργασίας · {class}",
    body: "Για αύριο: {note}",
    placeholders: ["class", "note", "due_date"],
    url: STUDENT_URL,
  },
  quiz: {
    label: "New quiz",
    group: "school",
    switch: "quizzes",
    title: "Νέο κουίζ · {class}",
    body: "{title}",
    placeholders: ["class", "title", "due_date"],
    url: STUDENT_URL,
  },
  quiz_reminder: {
    label: "Quiz deadline reminder",
    group: "school",
    switch: "quiz_reminders",
    title: "Το κουίζ λήγει αύριο",
    body: "«{title}» ({class}) - δεν το έχετε κάνει ακόμα.",
    placeholders: ["class", "title", "due_date"],
    url: STUDENT_URL,
  },
  assessment: {
    label: "New test",
    group: "school",
    switch: "assessments",
    title: "Νέο διαγώνισμα",
    body: "«{title}» - {date} {time}",
    placeholders: ["title", "date", "time"],
    url: STUDENT_URL,
  },
  assessment_moved: {
    label: "Test date moved",
    group: "school",
    switch: "assessments",
    title: "Αλλαγή διαγωνίσματος",
    body: "«{title}» μεταφέρθηκε στις {new_date} {new_time}.",
    placeholders: ["title", "new_date", "new_time"],
    url: STUDENT_URL,
  },
  assessment_reminder: {
    label: "Test reminder",
    group: "school",
    switch: "test_reminders",
    title: "Αύριο διαγώνισμα",
    body: "«{title}» - {date} {time}",
    placeholders: ["title", "date", "time"],
    url: STUDENT_URL,
  },
  lesson_cancelled: {
    label: "Lesson cancelled",
    group: "school",
    switch: "lesson_changes",
    title: "Ακύρωση μαθήματος · {class}",
    body: "Το μάθημα της {date} {time} ακυρώνεται.",
    placeholders: ["class", "date", "time"],
    url: STUDENT_URL,
  },
  lesson_moved: {
    label: "Lesson moved",
    group: "school",
    switch: "lesson_changes",
    title: "Αλλαγή ώρας · {class}",
    body: "Το μάθημα της {date} {time} μεταφέρεται στις {new_date} {new_time}.",
    placeholders: ["class", "date", "time", "new_date", "new_time"],
    url: STUDENT_URL,
  },
  lesson_extra: {
    label: "Extra lesson",
    group: "school",
    switch: "lesson_changes",
    title: "Έκτακτο μάθημα · {class}",
    body: "{date} {time}",
    placeholders: ["class", "date", "time"],
    url: STUDENT_URL,
  },
  lesson_restored: {
    label: "Lesson back on",
    group: "school",
    switch: "lesson_changes",
    title: "Το μάθημα γίνεται κανονικά · {class}",
    body: "Το μάθημα της {date} {time} γίνεται τελικά κανονικά.",
    placeholders: ["class", "date", "time"],
    url: STUDENT_URL,
  },
  mark_entered: {
    label: "Test marked",
    group: "school",
    switch: "marks",
    title: "Νέος βαθμός",
    body: "Βαθμολογήθηκε το «{title}».",
    placeholders: ["title"],
    url: STUDENT_URL,
  },
  quiz_graded: {
    label: "Quiz graded",
    group: "school",
    switch: "marks",
    title: "Διορθώθηκε το κουίζ",
    body: "Δείτε το αποτέλεσμα στο «{title}».",
    placeholders: ["title"],
    url: STUDENT_URL,
  },
  absence_student: {
    label: "Absence (student)",
    group: "school",
    switch: "absences",
    title: "Απουσία · {class}",
    body: "Καταγράφηκε απουσία στο μάθημα {class} ({date}).",
    placeholders: ["class", "date", "student"],
    url: STUDENT_URL,
  },
  absence_parent: {
    label: "Absence (parents)",
    group: "school",
    switch: "absences",
    title: "Απουσία · {student}",
    body: "{student}: απουσία στο μάθημα {class} ({date}).",
    placeholders: ["class", "date", "student"],
    url: PARENT_URL,
  },
  receipt: {
    label: "Receipt issued",
    group: "money",
    switch: "receipts",
    title: "Νέα απόδειξη {receipt}",
    body: "Πατήστε για λεπτομέρειες.",
    placeholders: ["receipt"],
    url: PARENT_URL,
  },
  monthly_charge: {
    label: "Monthly tuition charged",
    group: "money",
    switch: "monthly_charges",
    title: "Δίδακτρα {month}",
    body: "Καταχωρήθηκαν τα δίδακτρα του μήνα. Πατήστε για λεπτομέρειες.",
    placeholders: ["month"],
    url: PARENT_URL,
  },
  balance_reminder: {
    label: "Unpaid balance reminder",
    group: "money",
    switch: "balance_reminder",
    title: "Υπενθύμιση υπολοίπου",
    body: "Υπάρχει ανεξόφλητο υπόλοιπο. Πατήστε για λεπτομέρειες.",
    placeholders: [],
    url: PARENT_URL,
  },
  teacher_quiz_review: {
    label: "Quiz waiting for review",
    group: "teacher",
    switch: "teacher_quiz_review",
    title: "Κουίζ προς έλεγχο",
    body: "{student} υπέβαλε το «{title}» - υπάρχουν απαντήσεις ανάπτυξης.",
    placeholders: ["student", "title"],
    url: TEACHER_URL,
  },
  teacher_charge_failed: {
    label: "Monthly charge run failed",
    group: "teacher",
    switch: "teacher_charge_failed",
    title: "Η μηνιαία χρέωση απέτυχε",
    body: "Οι χρεώσεις του μήνα {month} δεν καταχωρήθηκαν. Ελέγξτε τα Οικονομικά.",
    placeholders: ["month"],
    url: TEACHER_URL,
  },
  teacher_mydata_failed: {
    label: "myDATA submission failed",
    group: "teacher",
    switch: "teacher_mydata_failed",
    title: "Αποτυχία myDATA",
    body: "Η απόδειξη {receipt} δεν διαβιβάστηκε στο myDATA.",
    placeholders: ["receipt"],
    url: TEACHER_URL,
  },
} as const satisfies Record<string, EventDefinition>;

export type NotificationEvent = keyof typeof EVENTS;

/** Every event whose text the teacher can edit (= every catalogue event). */
export const EDITABLE_EVENTS = Object.keys(EVENTS) as NotificationEvent[];

export const TITLE_MAX_LENGTH = 60;
export const BODY_MAX_LENGTH = 180;

export type MessageOverride = { title: string; body: string };

export type RenderedMessage = { title: string; body: string; url: string };

const PLACEHOLDER_PATTERN = /\{([a-z_]+)\}/g;

function fill(template: string, values: MessageValues): string {
  return template
    .replace(PLACEHOLDER_PATTERN, (match, name: string) =>
      name in PLACEHOLDERS ? (values[name as Placeholder] ?? "").trim() : match,
    )
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,)])/g, "$1")
    .trim();
}

/** Cuts text to `max` characters, ending with an ellipsis if it was longer. */
export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

/**
 * The text of one notification: the teacher's override if there is one,
 * else the default, with placeholders filled. A missing value becomes
 * empty text - a phone never shows a raw "{date}".
 */
export function renderMessage(
  event: NotificationEvent,
  values: MessageValues,
  override?: MessageOverride | null,
): RenderedMessage {
  const definition = EVENTS[event];
  const source = override ?? definition;
  return {
    title: truncate(fill(source.title, values), TITLE_MAX_LENGTH),
    body: truncate(fill(source.body, values), BODY_MAX_LENGTH),
    url: definition.url,
  };
}

/** The same text with the sample values, for the App tab's preview. */
export function renderPreview(
  event: NotificationEvent,
  override?: MessageOverride | null,
): RenderedMessage {
  const samples = Object.fromEntries(
    Object.entries(PLACEHOLDERS).map(([key, value]) => [key, value.sample]),
  ) as MessageValues;
  return renderMessage(event, samples, override);
}

/**
 * Problems with a teacher-edited text, in Greek, or [] if it can be saved.
 * Rejects placeholders the event doesn't offer - which is also what keeps
 * amounts off the lock screen for money notices.
 */
export function validateTemplate(
  event: NotificationEvent,
  title: string,
  body: string,
): string[] {
  const errors: string[] = [];
  const allowed = new Set<string>(EVENTS[event].placeholders);

  if (!title.trim()) errors.push("Ο τίτλος δεν μπορεί να είναι κενός.");
  if (!body.trim()) errors.push("Το κείμενο δεν μπορεί να είναι κενό.");
  if (title.trim().length > TITLE_MAX_LENGTH) {
    errors.push(`Ο τίτλος ξεπερνά τους ${TITLE_MAX_LENGTH} χαρακτήρες.`);
  }
  if (body.trim().length > BODY_MAX_LENGTH) {
    errors.push(`Το κείμενο ξεπερνά τους ${BODY_MAX_LENGTH} χαρακτήρες.`);
  }

  const unknown = new Set<string>();
  for (const text of [title, body]) {
    for (const match of text.matchAll(PLACEHOLDER_PATTERN)) {
      if (!allowed.has(match[1])) unknown.add(`{${match[1]}}`);
    }
  }
  if (unknown.size > 0) {
    errors.push(
      `Μη διαθέσιμα πεδία για αυτή την ειδοποίηση: ${[...unknown].join(", ")}.`,
    );
  }
  return errors;
}

/**
 * Alerts to the teacher's own devices. They ignore pause, class mute and
 * quiet hours - a failed charge run matters at any hour.
 */
export function isTeacherAlert(event: string): boolean {
  return event.startsWith("teacher_");
}

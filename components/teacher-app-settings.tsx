"use client";

import * as React from "react";
import { toast } from "sonner";
import { BellIcon, PencilIcon, SendIcon, Trash2Icon } from "lucide-react";

import {
  deleteAnnouncementAction,
  getAppSettingsAction,
  resetNotificationTemplateAction,
  saveAnnouncementAction,
  saveNotificationTemplateAction,
  sendTestNotificationAction,
  setAnnouncementEnabledAction,
  setClassNotificationsMutedAction,
  updateNotificationSettingsAction,
  type AnnouncementInput,
  type AppSettingsData,
} from "@/app/protected/teacher/app-settings-actions";
import { usePushDevice } from "@/components/use-push-device";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getErrorMessage } from "@/lib/expected-error";
import { cn } from "@/lib/utils";
import {
  BODY_MAX_LENGTH,
  EVENTS,
  PLACEHOLDERS,
  TITLE_MAX_LENGTH,
  renderPreview,
  validateTemplate,
  type EventGroup,
  type MessageOverride,
  type NotificationEvent,
  type NotificationSwitch,
} from "@/lib/push/messages";
import type { NotificationSettings } from "@/lib/push/settings";

// ---------------------------------------------------------------------------
// Small building blocks
// ---------------------------------------------------------------------------

function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors disabled:opacity-50",
        checked ? "border-brand bg-brand" : "border-border bg-muted",
      )}
    >
      <span
        className={cn(
          "inline-block size-4 rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-6" : "translate-x-1",
        )}
      />
    </button>
  );
}

function SettingRow({
  title,
  description,
  control,
  children,
}: {
  title: string;
  description?: React.ReactNode;
  control: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="border-b border-border/60 py-3 last:border-b-0">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium">{title}</p>
          {description ? (
            <p className="text-xs text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {control}
      </div>
      {children}
    </div>
  );
}

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", {
    timeZone: "Europe/Athens",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

// ---------------------------------------------------------------------------
// Which switch shows which events and options
// ---------------------------------------------------------------------------

type SwitchDefinition = {
  key: NotificationSwitch;
  label: string;
  description: string;
  group: EventGroup;
};

const SWITCHES: SwitchDefinition[] = [
  { key: "homework", group: "school", label: "New homework", description: "To the class's students the moment you set it." },
  { key: "homework_reminders", group: "school", label: "Homework reminder", description: "The evening before the next lesson (or the due date)." },
  { key: "quizzes", group: "school", label: "New quiz", description: "When a quiz is assigned to a class." },
  { key: "quiz_reminders", group: "school", label: "Quiz deadline reminder", description: "The evening before a quiz's due date, only to students who haven't done it." },
  { key: "assessments", group: "school", label: "New test / test date moved", description: "To the assigned students." },
  { key: "test_reminders", group: "school", label: "Test reminder", description: "The evening before a test." },
  { key: "lesson_changes", group: "school", label: "Lesson changes", description: "Cancelled, moved, extra or back-on lessons (today or later)." },
  { key: "marks", group: "school", label: "Marks & results", description: "A test is marked, or a quiz with written answers is graded." },
  { key: "absences", group: "school", label: "Absences", description: "To the student and their parents. Absent only - late doesn't count." },
  { key: "receipts", group: "money", label: "Receipt issued", description: "To the family's parents. Never shows amounts." },
  { key: "monthly_charges", group: "money", label: "Monthly tuition charged", description: "When the month's charges are applied." },
  { key: "balance_reminder", group: "money", label: "Unpaid balance reminder", description: "Once a month, to families with an unpaid balance." },
  { key: "teacher_quiz_review", group: "teacher", label: "Quiz waiting for review", description: "A submitted quiz has written answers to check." },
  { key: "teacher_charge_failed", group: "teacher", label: "Monthly charge run failed", description: "The automatic charge run hit an error." },
  { key: "teacher_mydata_failed", group: "teacher", label: "myDATA submission failed", description: "A receipt couldn't be sent to AADE." },
];

const GROUP_TITLES: Record<EventGroup, string> = {
  school: "School - to students",
  money: "Money - to parents",
  teacher: "Alerts - to you",
};

const eventsForSwitch = (key: NotificationSwitch) =>
  (Object.keys(EVENTS) as NotificationEvent[]).filter(
    (event) => EVENTS[event].switch === key,
  );

// ---------------------------------------------------------------------------
// Editing one notification's text
// ---------------------------------------------------------------------------

function TemplateEditor({
  event,
  override,
  onSaved,
}: {
  event: NotificationEvent;
  override: MessageOverride | undefined;
  onSaved: (event: NotificationEvent, value: MessageOverride | undefined) => void;
}) {
  const definition = EVENTS[event];
  const [title, setTitle] = React.useState(override?.title ?? definition.title);
  const [body, setBody] = React.useState(override?.body ?? definition.body);
  const [busy, setBusy] = React.useState(false);
  const bodyRef = React.useRef<HTMLTextAreaElement>(null);

  const errors = validateTemplate(event, title, body);
  const preview = renderPreview(event, { title, body });
  const isDefault = title === definition.title && body === definition.body;

  const insert = (placeholder: string) => {
    const element = bodyRef.current;
    const token = `{${placeholder}}`;
    if (!element) {
      setBody((current) => current + token);
      return;
    }
    const start = element.selectionStart ?? body.length;
    const end = element.selectionEnd ?? body.length;
    setBody(body.slice(0, start) + token + body.slice(end));
  };

  const save = async () => {
    setBusy(true);
    try {
      const saved = await saveNotificationTemplateAction(event, title, body);
      onSaved(event, saved);
      toast.success("Text saved");
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Couldn't save the text"));
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    setBusy(true);
    try {
      await resetNotificationTemplateAction(event);
      setTitle(definition.title);
      setBody(definition.body);
      onSaved(event, undefined);
      toast.success("Default text restored");
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Couldn't restore the default"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 space-y-3 rounded-xl border border-border/70 bg-muted/30 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {definition.label}
      </p>
      <div className="grid gap-3 md:grid-cols-[1fr_260px]">
        <div className="space-y-2">
          <div className="space-y-1">
            <Label htmlFor={`template-title-${event}`}>Title</Label>
            <Input
              id={`template-title-${event}`}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={TITLE_MAX_LENGTH + 20}
            />
            <p className="text-xs text-muted-foreground">
              {title.trim().length}/{TITLE_MAX_LENGTH}
            </p>
          </div>
          <div className="space-y-1">
            <Label htmlFor={`template-body-${event}`}>Text</Label>
            <Textarea
              id={`template-body-${event}`}
              ref={bodyRef}
              rows={2}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={BODY_MAX_LENGTH + 40}
            />
            <p className="text-xs text-muted-foreground">
              {body.trim().length}/{BODY_MAX_LENGTH}
            </p>
          </div>
          {definition.placeholders.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {definition.placeholders.map((placeholder) => (
                <button
                  key={placeholder}
                  type="button"
                  onClick={() => insert(placeholder)}
                  title={PLACEHOLDERS[placeholder].label}
                  className="rounded-full border border-border bg-card px-2 py-0.5 font-mono text-xs hover:border-brand"
                >
                  {`{${placeholder}}`}{" "}
                  <span className="font-sans text-muted-foreground">
                    {PLACEHOLDERS[placeholder].label}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No placeholders for this notice.</p>
          )}
          {errors.length > 0 ? (
            <ul className="space-y-0.5 text-xs text-red-700 dark:text-red-400">
              {errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          ) : null}
        </div>

        <div aria-label="Preview" className="space-y-1">
          <p className="text-xs text-muted-foreground">Preview (sample values)</p>
          <div className="rounded-2xl border border-border bg-card p-3 shadow-sm">
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <BellIcon className="size-3" aria-hidden="true" /> Modus · now
            </div>
            <p className="mt-1 text-sm font-semibold">{preview.title}</p>
            <p className="text-sm">{preview.body}</p>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={() => void save()} disabled={busy || errors.length > 0}>
          Save text
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => void reset()}
          disabled={busy || (isDefault && !override)}
        >
          Restore default
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// This device
// ---------------------------------------------------------------------------

function ThisDeviceCard({ configured }: { configured: boolean }) {
  const { state, busy, error, enable, disable } = usePushDevice();
  const [sending, setSending] = React.useState(false);

  const sendTest = async () => {
    setSending(true);
    try {
      const result = await sendTestNotificationAction();
      toast.success(`Test sent to ${result.delivered} of ${result.devices} device(s)`);
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, "Couldn't send the test"));
    } finally {
      setSending(false);
    }
  };

  const status: Record<typeof state, string> = {
    loading: "Checking this device…",
    unavailable: configured
      ? "Notifications need the installed/production app (the service worker isn't running here)."
      : "Notifications aren't configured on the server yet.",
    unsupported: "This browser can't receive notifications.",
    "needs-install": "On iPhone, install the app to the home screen first, then open it from there.",
    blocked: "Notifications are blocked for Modus in this browser's settings.",
    off: "Off on this device.",
    on: "On for this device.",
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">This device</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm">{status[state]}</p>
        <div className="flex flex-wrap gap-2">
          {state === "off" && (
            <Button type="button" size="sm" onClick={() => void enable()} disabled={busy}>
              Turn on notifications
            </Button>
          )}
          {state === "on" && (
            <Button type="button" size="sm" variant="outline" onClick={() => void disable()} disabled={busy}>
              Turn off
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void sendTest()}
            disabled={sending || !configured}
          >
            <SendIcon className="size-3.5" aria-hidden="true" />
            Send a test to my devices
          </Button>
        </div>
        {error ? <p className="text-sm text-red-700 dark:text-red-400">{error}</p> : null}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Greetings & scheduled notices
// ---------------------------------------------------------------------------

const STARTERS: { label: string; input: Partial<AnnouncementInput> }[] = [
  { label: "Christmas", input: { title: "Καλά Χριστούγεννα!", body: "Χρόνια πολλά και καλές γιορτές από το Modus!", recurrence: "yearly_date", sendOn: "2026-12-25" } },
  { label: "New Year", input: { title: "Καλή χρονιά!", body: "Ευτυχισμένο το νέο έτος! Υγεία και επιτυχίες από το Modus.", recurrence: "yearly_date", sendOn: "2027-01-01" } },
  { label: "Easter", input: { title: "Καλό Πάσχα!", body: "Χρόνια πολλά και Καλή Ανάσταση από το Modus!", recurrence: "yearly_orthodox_easter", sendOn: null } },
  { label: "Summer", input: { title: "Καλό καλοκαίρι!", body: "Καλές διακοπές! Τα λέμε τον Σεπτέμβρη.", recurrence: "once", sendOn: null } },
  { label: "New school year", input: { title: "Καλή σχολική χρονιά!", body: "Καλή αρχή και καλή επιτυχία στη νέα χρονιά!", recurrence: "yearly_date", sendOn: "2027-09-11" } },
];

const EMPTY_ANNOUNCEMENT: AnnouncementInput = {
  title: "",
  body: "",
  audience: "both",
  classId: null,
  recurrence: "now",
  sendOn: null,
  sendTime: "10:00",
};

const RECURRENCE_LABELS: Record<string, string> = {
  once: "Once",
  yearly_date: "Every year",
  yearly_orthodox_easter: "Every year on Easter Sunday",
};

const AUDIENCE_LABELS: Record<string, string> = {
  students: "Students",
  parents: "Parents",
  both: "Students & parents",
};

function AnnouncementsCard({
  data,
  onChanged,
}: {
  data: AppSettingsData;
  onChanged: () => void;
}) {
  const [form, setForm] = React.useState<AnnouncementInput>(EMPTY_ANNOUNCEMENT);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const set = (changes: Partial<AnnouncementInput>) =>
    setForm((current) => ({ ...current, ...changes }));

  const submit = async () => {
    setBusy(true);
    try {
      const result = await saveAnnouncementAction(form, editingId ?? undefined);
      toast.success(result.sent ? "Sent" : "Scheduled");
      setForm(EMPTY_ANNOUNCEMENT);
      setEditingId(null);
      onChanged();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Couldn't save the notice"));
    } finally {
      setBusy(false);
    }
  };

  const run = async (work: () => Promise<unknown>, failure: string) => {
    try {
      await work();
      onChanged();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, failure));
    }
  };

  const classNameOf = (id: string | null) =>
    id ? data.classes.find((c) => c.id === id)?.name ?? "A class" : "All classes";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Greetings & scheduled notices</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-1.5">
          <span className="text-xs text-muted-foreground">Start from:</span>
          {STARTERS.map((starter) => (
            <button
              key={starter.label}
              type="button"
              onClick={() => set(starter.input)}
              className="rounded-full border border-border bg-card px-2 py-0.5 text-xs hover:border-brand"
            >
              {starter.label}
            </button>
          ))}
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="announcement-title">Title</Label>
            <Input id="announcement-title" value={form.title} maxLength={60} onChange={(e) => set({ title: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="announcement-audience">To</Label>
            <select
              id="announcement-audience"
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              value={form.audience}
              onChange={(e) => set({ audience: e.target.value as AnnouncementInput["audience"] })}
            >
              <option value="both">Students & parents</option>
              <option value="students">Students</option>
              <option value="parents">Parents</option>
            </select>
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label htmlFor="announcement-body">Text</Label>
            <Textarea id="announcement-body" rows={2} value={form.body} maxLength={180} onChange={(e) => set({ body: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="announcement-class">Class</Label>
            <select
              id="announcement-class"
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              value={form.classId ?? ""}
              onChange={(e) => set({ classId: e.target.value || null })}
            >
              <option value="">All classes</option>
              {data.classes.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="announcement-when">When</Label>
            <select
              id="announcement-when"
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              value={form.recurrence}
              onChange={(e) => set({ recurrence: e.target.value as AnnouncementInput["recurrence"] })}
            >
              <option value="now">Send now</option>
              <option value="once">Once, on a date</option>
              <option value="yearly_date">Every year, on a date</option>
              <option value="yearly_orthodox_easter">Every year on (Orthodox) Easter Sunday</option>
            </select>
          </div>
          {(form.recurrence === "once" || form.recurrence === "yearly_date") && (
            <div className="space-y-1">
              <Label htmlFor="announcement-date">Date</Label>
              <Input id="announcement-date" type="date" value={form.sendOn ?? ""} onChange={(e) => set({ sendOn: e.target.value || null })} />
            </div>
          )}
          {form.recurrence !== "now" && (
            <div className="space-y-1">
              <Label htmlFor="announcement-time">Time</Label>
              <Input id="announcement-time" type="time" value={form.sendTime} onChange={(e) => set({ sendTime: e.target.value })} />
              <p className="text-xs text-muted-foreground">
                Until a frequent scheduler is set up, scheduled notices go out with the morning run (≈10:00).
              </p>
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <Button type="button" size="sm" onClick={() => void submit()} disabled={busy || !form.title.trim() || !form.body.trim()}>
            {form.recurrence === "now" ? "Send now" : editingId ? "Save changes" : "Schedule"}
          </Button>
          {editingId && (
            <Button type="button" size="sm" variant="outline" onClick={() => { setEditingId(null); setForm(EMPTY_ANNOUNCEMENT); }}>
              Cancel
            </Button>
          )}
        </div>

        {data.announcements.length > 0 && (
          <ul className="divide-y divide-border/60 rounded-xl border border-border/70">
            {data.announcements.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{a.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {RECURRENCE_LABELS[a.recurrence]}
                    {a.send_on && a.recurrence !== "yearly_orthodox_easter" ? ` · ${a.recurrence === "yearly_date" ? a.send_on.slice(5) : a.send_on}` : ""}
                    {" · "}{AUDIENCE_LABELS[a.audience]} · {classNameOf(a.class_id)}
                    {" · "}
                    {a.enabled && a.next_send_on ? `next: ${a.next_send_on}` : a.enabled ? "done" : "paused"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Toggle
                    checked={a.enabled}
                    label={`${a.title} enabled`}
                    onChange={(value) => void run(() => setAnnouncementEnabledAction(a.id, value), "Couldn't update")}
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label={`Edit ${a.title}`}
                    onClick={() => {
                      setEditingId(a.id);
                      setForm({
                        title: a.title,
                        body: a.body,
                        audience: a.audience,
                        classId: a.class_id,
                        recurrence: a.recurrence,
                        sendOn: a.send_on,
                        sendTime: a.send_time,
                      });
                    }}
                  >
                    <PencilIcon className="size-4" aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label={`Delete ${a.title}`}
                    onClick={() => void run(() => deleteAnnouncementAction(a.id), "Couldn't delete")}
                  >
                    <Trash2Icon className="size-4" aria-hidden="true" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// The tab
// ---------------------------------------------------------------------------

const INSTALL_TEXT = `Εγκαταστήστε την εφαρμογή Modus στο κινητό σας:
https://www.modusmath.gr/start

Android (Chrome): ανοίξτε τον σύνδεσμο, συνδεθείτε και πατήστε «Εγκατάσταση» (ή μενού ⋮ → «Εγκατάσταση εφαρμογής»).
iPhone (Safari): ανοίξτε τον σύνδεσμο, πατήστε Κοινοποίηση → «Προσθήκη στην οθόνη Αφετηρίας». Ανοίξτε την εφαρμογή από την αρχική οθόνη, συνδεθείτε και πατήστε «Ενεργοποίηση ειδοποιήσεων».`;

export function TeacherAppSettings({ initialData }: { initialData: AppSettingsData | null }) {
  const [data, setData] = React.useState<AppSettingsData | null>(initialData);
  const [editing, setEditing] = React.useState<NotificationSwitch | null>(null);

  const reload = React.useCallback(async () => {
    try {
      setData(await getAppSettingsAction());
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Couldn't load the App settings"));
    }
  }, []);

  if (!data) {
    return (
      <Card>
        <CardContent className="space-y-3 pt-6">
          <p className="text-sm">The App settings couldn&apos;t be loaded. Has the push-notifications migration been applied?</p>
          <Button type="button" size="sm" variant="outline" onClick={() => void reload()}>
            Try again
          </Button>
        </CardContent>
      </Card>
    );
  }

  const { settings } = data;

  const update = async (changes: Partial<NotificationSettings>) => {
    const previous = data.settings;
    setData({ ...data, settings: { ...previous, ...changes } });
    try {
      const saved = await updateNotificationSettingsAction(changes);
      setData((current) => (current ? { ...current, settings: saved } : current));
    } catch (error: unknown) {
      setData((current) => (current ? { ...current, settings: previous } : current));
      toast.error(getErrorMessage(error, "Couldn't save the setting"));
    }
  };

  const onTemplateSaved = (event: NotificationEvent, value: MessageOverride | undefined) => {
    setData((current) =>
      current ? { ...current, templates: { ...current.templates, [event]: value } } : current,
    );
  };

  const setMuted = async (classId: string, muted: boolean) => {
    setData({
      ...data,
      classes: data.classes.map((c) => (c.id === classId ? { ...c, muted } : c)),
    });
    try {
      await setClassNotificationsMutedAction(classId, muted);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Couldn't update the class"));
      void reload();
    }
  };

  const lastRun = (job: string) => {
    const run = data.jobRuns.find((r) => r.job === job);
    return run ? `${formatDateTime(run.last_run_at)}${run.forced ? " (daily cron)" : ""}` : "never";
  };
  const frequentScheduler = data.frequentSchedulerActive;

  const switchOptions = (key: NotificationSwitch) => {
    if (key === "homework_reminders") {
      return (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Label htmlFor="reminder-time" className="text-xs">Evening reminders at</Label>
          <Input
            id="reminder-time"
            type="time"
            className="h-8 w-28"
            value={settings.homework_reminder_time}
            onChange={(e) => e.target.value && void update({ homework_reminder_time: e.target.value })}
          />
          <span>
            {frequentScheduler
              ? "(applies to homework, quiz and test reminders)"
              : "(applies to homework, quiz and test reminders; until a frequent scheduler is set up they go out at ≈19:00-20:00)"}
          </span>
        </div>
      );
    }
    if (key === "absences") {
      return (
        <fieldset className="mt-2 space-y-1 text-xs">
          <legend className="sr-only">When to send absence notices</legend>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="absence-timing"
              checked={settings.absence_timing === "immediate"}
              onChange={() => void update({ absence_timing: "immediate" })}
            />
            Right away (only for marks saved on the lesson&apos;s day; changing the mark later sends no correction)
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="absence-timing"
              checked={settings.absence_timing === "after_lesson"}
              onChange={() => void update({ absence_timing: "after_lesson" })}
            />
            2 hours after the lesson ends (a correction before then cancels it)
          </label>
          {settings.absence_timing === "after_lesson" && !frequentScheduler && (
            <p className="text-amber-700 dark:text-amber-400">
              Needs a scheduler calling /api/cron/notifications every ~10 minutes - last run: {lastRun("frequent")}. Until then these notices aren&apos;t sent.
            </p>
          )}
        </fieldset>
      );
    }
    if (key === "balance_reminder") {
      return (
        <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
          <Label htmlFor="balance-day" className="text-xs">Day of the month</Label>
          <Input
            id="balance-day"
            type="number"
            min={1}
            max={28}
            className="h-8 w-20"
            value={settings.balance_reminder_day}
            onChange={(e) => {
              const day = Number(e.target.value);
              if (Number.isInteger(day) && day >= 1 && day <= 28) void update({ balance_reminder_day: day });
            }}
          />
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-4">
      {!data.configured && (
        <div role="alert" className="rounded-xl border border-amber-600/30 bg-amber-500/10 p-3 text-sm">
          Notifications aren&apos;t configured on the server yet: add the VAPID keys
          (NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT) to the
          environment. Notices still appear in the families&apos; in-portal list.
        </div>
      )}

      <Card className={cn(settings.paused && "border-amber-600/40")}>
        <CardContent className="pt-6">
          <SettingRow
            title="Pause all notifications"
            description={
              settings.paused
                ? "Paused - families get nothing (except your own alerts) until you switch this off."
                : "For holidays or the summer. Your own alerts keep working."
            }
            control={
              <Toggle checked={settings.paused} label="Pause all notifications" onChange={(value) => void update({ paused: value })} />
            }
          />
        </CardContent>
      </Card>

      <ThisDeviceCard configured={data.configured} />

      {(["school", "money", "teacher"] as EventGroup[]).map((group) => (
        <Card key={group}>
          <CardHeader>
            <CardTitle className="text-base">{GROUP_TITLES[group]}</CardTitle>
          </CardHeader>
          <CardContent>
            {SWITCHES.filter((s) => s.group === group).map((s) => (
              <SettingRow
                key={s.key}
                title={s.label}
                description={s.description}
                control={
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditing(editing === s.key ? null : s.key)}
                      aria-expanded={editing === s.key}
                    >
                      <PencilIcon className="size-3.5" aria-hidden="true" />
                      Text
                    </Button>
                    <Toggle checked={settings[s.key]} label={s.label} onChange={(value) => void update({ [s.key]: value })} />
                  </div>
                }
              >
                {switchOptions(s.key)}
                {editing === s.key &&
                  eventsForSwitch(s.key).map((event) => (
                    <TemplateEditor
                      key={event}
                      event={event}
                      override={data.templates[event]}
                      onSaved={onTemplateSaved}
                    />
                  ))}
              </SettingRow>
            ))}
            {group === "school" && (
              <SettingRow
                title="Students without a login → parents"
                description="A student who can't sign in gets their school notices through their parents instead."
                control={
                  <Toggle
                    checked={settings.parent_fallback}
                    label="Students without a login → parents"
                    onChange={(value) => void update({ parent_fallback: value })}
                  />
                }
              />
            )}
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quiet hours & classes</CardTitle>
        </CardHeader>
        <CardContent>
          <SettingRow
            title="Quiet hours"
            description="Notices that come up during these hours are held and sent with the next morning run. Your own alerts aren't held."
            control={
              <Toggle checked={settings.quiet_hours_enabled} label="Quiet hours" onChange={(value) => void update({ quiet_hours_enabled: value })} />
            }
          >
            {settings.quiet_hours_enabled && (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                <Label htmlFor="quiet-start" className="text-xs">From</Label>
                <Input id="quiet-start" type="time" className="h-8 w-28" value={settings.quiet_start} onChange={(e) => e.target.value && void update({ quiet_start: e.target.value })} />
                <Label htmlFor="quiet-end" className="text-xs">to</Label>
                <Input id="quiet-end" type="time" className="h-8 w-28" value={settings.quiet_end} onChange={(e) => e.target.value && void update({ quiet_end: e.target.value })} />
              </div>
            )}
          </SettingRow>
          {data.classes.map((c) => (
            <SettingRow
              key={c.id}
              title={c.name}
              description={c.muted ? "Muted - this class's students get no school notices." : undefined}
              control={<Toggle checked={!c.muted} label={`Notifications for ${c.name}`} onChange={(value) => void setMuted(c.id, !value)} />}
            />
          ))}
        </CardContent>
      </Card>

      <AnnouncementsCard data={data} onChanged={() => void reload()} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Who has notifications on</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm">
            Students: <strong>{data.reach.students}</strong> · Parents: <strong>{data.reach.parents}</strong> · Your devices: <strong>{data.reach.teacher}</strong>
          </p>
          <ul className="divide-y divide-border/60 rounded-xl border border-border/70 text-sm">
            {data.families.map((family) => (
              <li key={family.familyId} className="flex flex-wrap gap-x-4 gap-y-1 p-2">
                {[...family.students.map((p) => ({ ...p, role: "student" })), ...family.parents.map((p) => ({ ...p, role: "parent" }))].map((person, index) => (
                  <span key={`${person.role}-${index}`} className={cn(person.role === "parent" && "text-muted-foreground")}>
                    {person.devices > 0 ? "✓" : "✗"} {person.name}
                    {!person.hasLogin ? " (no login)" : ""}
                  </span>
                ))}
              </li>
            ))}
          </ul>
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground">Install instructions to send to families</summary>
            <Textarea readOnly rows={6} value={INSTALL_TEXT} className="mt-2 text-xs" />
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-2"
              onClick={() => {
                void navigator.clipboard.writeText(INSTALL_TEXT).then(() => toast.success("Copied"));
              }}
            >
              Copy
            </Button>
          </details>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent notifications</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.log.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing sent yet.</p>
          ) : (
            <ul className="divide-y divide-border/60 text-sm">
              {data.log.map((row) => (
                <li key={row.id} className="flex flex-wrap justify-between gap-2 py-2">
                  <span className="min-w-0">
                    <span className="font-medium">{row.title}</span>{" "}
                    <span className="text-muted-foreground">→ {row.audience}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatDateTime(row.created_at)} ·{" "}
                    {row.outcome === "sent"
                      ? `${row.delivered}/${row.devices} devices${row.failed ? `, ${row.failed} failed` : ""}`
                      : row.outcome === "held"
                        ? "held (quiet hours)"
                        : row.outcome === "no_devices"
                          ? "no devices"
                          : "not configured"}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">
            Morning run: {lastRun("morning")} · Evening reminders: {lastRun("evening_reminders")} · Frequent scheduler: {lastRun("frequent")}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

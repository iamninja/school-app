import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  BODY_MAX_LENGTH,
  EDITABLE_EVENTS,
  EVENTS,
  PLACEHOLDERS,
  TITLE_MAX_LENGTH,
  renderMessage,
  renderPreview,
  validateTemplate,
} from "@/lib/push/messages";
import { DEFAULT_NOTIFICATION_SETTINGS } from "@/lib/push/settings";

describe("notification catalogue", () => {
  it("every default text fits a phone and uses only its own placeholders", () => {
    for (const event of EDITABLE_EVENTS) {
      const { title, body } = EVENTS[event];
      expect(validateTemplate(event, title, body), event).toEqual([]);
      expect(title.length, event).toBeLessThanOrEqual(TITLE_MAX_LENGTH);
      expect(body.length, event).toBeLessThanOrEqual(BODY_MAX_LENGTH);
    }
  });

  it("offers no amount placeholder for money notices, and no amount in their texts", () => {
    const moneyEvents = EDITABLE_EVENTS.filter((e) => EVENTS[e].group === "money");
    expect(moneyEvents).toEqual(["receipt", "monthly_charge", "balance_reminder"]);
    expect(Object.keys(PLACEHOLDERS)).not.toContain("amount");
    for (const event of moneyEvents) {
      expect(EVENTS[event].title + EVENTS[event].body).not.toMatch(/€|\d+[,.]\d{2}/);
    }
  });

  it("maps every event to a switch the settings row has", () => {
    for (const event of EDITABLE_EVENTS) {
      expect(DEFAULT_NOTIFICATION_SETTINGS, event).toHaveProperty(EVENTS[event].switch);
    }
  });

  it("matches the event list the database accepts for edited texts", () => {
    // The newest definition wins: the original inline CHECK, or a later
    // migration's re-added notification_templates_event_check.
    const dir = path.join(process.cwd(), "supabase", "migrations");
    const pattern =
      /(?:event text primary key check|notification_templates_event_check check) \(event in \(([\s\S]*?)\)\)/g;
    const definitions = readdirSync(dir)
      .filter((name) => name.endsWith(".sql"))
      .sort()
      .flatMap((name) => [...readFileSync(path.join(dir, name), "utf8").matchAll(pattern)]);
    const latest = definitions.at(-1)!;
    const dbEvents = [...latest[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect(dbEvents.sort()).toEqual([...EDITABLE_EVENTS].sort());
  });

  it("sends school notices to the student portal and money notices to the parents'", () => {
    expect(EVENTS.homework.url).toBe("/student-dashboard");
    expect(EVENTS.absence_parent.url).toBe("/parent-dashboard");
    expect(EVENTS.receipt.url).toBe("/parent-dashboard");
    expect(EVENTS.teacher_charge_failed.url).toBe("/protected/teacher?section=billing");
    expect(EVENTS.teacher_quiz_review.url).toBe("/protected/teacher?section=quizzes");
    expect(EVENTS.teacher_mydata_failed.url).toBe("/protected/teacher?section=receipts");
  });
});

describe("renderMessage", () => {
  it("fills placeholders with the given values", () => {
    expect(
      renderMessage("lesson_moved", {
        class: "Γ' Λυκείου",
        date: "14/10",
        time: "17:00",
        new_date: "16/10",
        new_time: "18:00",
      }),
    ).toEqual({
      title: "Αλλαγή ώρας · Γ' Λυκείου",
      body: "Το μάθημα της 14/10 17:00 μεταφέρεται στις 16/10 18:00.",
      url: "/student-dashboard",
    });
  });

  it("uses the teacher's edited text when there is one", () => {
    const message = renderMessage(
      "receipt",
      { receipt: "Α-7" },
      { title: "Απόδειξη {receipt}", body: "Ευχαριστούμε!" },
    );
    expect(message.title).toBe("Απόδειξη Α-7");
    expect(message.body).toBe("Ευχαριστούμε!");
  });

  it("renders a missing value as nothing, never as a raw {placeholder}", () => {
    const message = renderMessage("assessment", { title: "Όρια" });
    expect(message.body).toBe("«Όρια»");
    expect(message.title + message.body).not.toContain("{");
  });

  it("cuts over-long values to what a phone shows", () => {
    const message = renderMessage("homework", { class: "Α", note: "x".repeat(500) });
    expect(message.body.length).toBe(BODY_MAX_LENGTH);
    expect(message.body.endsWith("…")).toBe(true);
  });

  it("previews with the sample values", () => {
    expect(renderPreview("homework").title).toBe("Νέα εργασία · Β' Λυκείου");
  });
});

describe("validateTemplate", () => {
  it("rejects placeholders the notice doesn't offer", () => {
    expect(validateTemplate("receipt", "Απόδειξη {receipt}", "Ποσό {amount}")).toEqual([
      "Μη διαθέσιμα πεδία για αυτή την ειδοποίηση: {amount}.",
    ]);
  });

  it("rejects empty and over-long texts", () => {
    expect(validateTemplate("homework", " ", "x".repeat(BODY_MAX_LENGTH + 1))).toEqual([
      "Ο τίτλος δεν μπορεί να είναι κενός.",
      `Το κείμενο ξεπερνά τους ${BODY_MAX_LENGTH} χαρακτήρες.`,
    ]);
  });
});

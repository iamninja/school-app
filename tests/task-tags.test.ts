import { describe, expect, it } from "vitest";
import {
  callContacts,
  emailRecipients,
  emailSubject,
  encodeTitle,
  mailtoHref,
  mentionQuery,
  parseTitle,
  plainTitle,
  searchDirectory,
  searchKey,
  tagToken,
  tagsIn,
  type TaskDirectory,
} from "@/lib/task-tags";

const ELENI = "11111111-1111-1111-1111-111111111111";
const GIORGOS = "22222222-2222-2222-2222-222222222222";
const MARIA = "33333333-3333-3333-3333-333333333333";
const CLASS = "44444444-4444-4444-4444-444444444444";
const SUPPLIER = "66666666-6666-6666-6666-666666666666";
const TEST = "77777777-7777-7777-7777-777777777777";
const HOMEWORK = "88888888-8888-8888-8888-888888888888";

const directory: TaskDirectory = {
  entries: [
    { kind: "student", id: MARIA, name: "Μαρία Παπαδοπούλου", detail: "Β Λυκείου", phone: "+306900000003", familyId: "f1", isPrimary: false },
    { kind: "parent", id: GIORGOS, name: "Γιώργος Παπαδόπουλος", detail: "Parent of Μαρία", phone: "+306900000002", familyId: "f1", isPrimary: false },
    { kind: "parent", id: ELENI, name: "Ελένη Παπαδοπούλου", detail: "Parent of Μαρία", phone: "+306900000001", familyId: "f1", isPrimary: true },
    { kind: "class", id: CLASS, name: "Β Λυκείου", detail: "Class", phone: null, familyId: null, isPrimary: false },
    { kind: "contact", id: SUPPLIER, name: "Χαρτοπωλείο Νίκας", detail: "Supplier", phone: "+302101234567", email: "info@nikas.gr", familyId: null, isPrimary: false },
    { kind: "assessment", id: TEST, name: "Διαγώνισμα Άλγεβρας", detail: "Mock exam · Β Λυκείου · 5/11", phone: null, familyId: null, isPrimary: false },
    { kind: "homework", id: HOMEWORK, name: "Β Λυκείου · 5/11", detail: "Ασκήσεις σελ. 42 παράγωγοι", phone: null, classId: "class-b", familyId: null, isPrimary: false },
  ],
};

// The same family, with emails.
const withEmails: TaskDirectory = {
  entries: directory.entries.map((entry) =>
    entry.id === ELENI
      ? { ...entry, email: "eleni@example.gr" }
      : entry.id === GIORGOS
        ? { ...entry, email: "ELENI@example.gr" }
        : entry.id === MARIA
          ? { ...entry, email: "maria@example.gr" }
          : entry,
  ),
};

describe("tag tokens", () => {
  it("round-trips text and tags", () => {
    const title = `Πάρε ${tagToken({ kind: "parent", id: ELENI, label: "Ελένη" })} για το διαγώνισμα`;
    expect(parseTitle(title)).toEqual([
      { type: "text", text: "Πάρε " },
      { type: "tag", tag: { kind: "parent", id: ELENI, label: "Ελένη" } },
      { type: "text", text: " για το διαγώνισμα" },
    ]);
    expect(plainTitle(title)).toBe("Πάρε @Ελένη για το διαγώνισμα");
  });

  it("drops brackets from a name so the token stays parseable", () => {
    expect(tagToken({ kind: "class", id: CLASS, label: "Β [Λυκείου] (2)" })).toBe(`@[Β Λυκείου 2](class:${CLASS})`);
  });

  it("encodes only the picked tags still in the text, longest name first", () => {
    const text = "Call @Μαρία Παπαδοπούλου and @Ελένη, not @Κώστας";
    const title = encodeTitle(text, [
      { kind: "parent", id: ELENI, label: "Ελένη" },
      { kind: "student", id: MARIA, label: "Μαρία Παπαδοπούλου" },
      { kind: "parent", id: GIORGOS, label: "Γιώργος" }, // deleted from the text
    ]);
    expect(tagsIn(title).map((tag) => tag.id)).toEqual([MARIA, ELENI]);
    expect(plainTitle(title)).toBe(text);
  });
});

describe("the @ picker", () => {
  it("finds the query being typed before the caret", () => {
    expect(mentionQuery("Call @ελ", 8)).toEqual({ start: 5, query: "ελ", marker: "@" });
    expect(mentionQuery("@", 1)).toEqual({ start: 0, query: "", marker: "@" });
    expect(mentionQuery("Πάρε +χαρ", 9)).toEqual({ start: 5, query: "χαρ", marker: "+" });
    expect(mentionQuery("Διόρθωσε #λυκ", 13)).toEqual({ start: 9, query: "λυκ", marker: "#" });
    expect(mentionQuery("2+2", 3)).toBeNull();
    expect(mentionQuery("mail@x", 6)).toBeNull();
    expect(mentionQuery("Call @Ελένη now", 15)).toBeNull();
  });

  it("matches without accents or case, names starting with the query first", () => {
    expect(searchKey("Ελένη")).toBe(searchKey("ελενη"));
    expect(searchDirectory(directory, "ελεν").map((entry) => entry.id)).toEqual([ELENI]);
    // "παπ" starts the surname of three people; the student comes first.
    expect(searchDirectory(directory, "παπ").map((entry) => entry.kind)).toEqual(["student", "parent", "parent"]);
    expect(searchDirectory(directory, "λυκ").map((entry) => entry.kind)).toEqual(["class", "student"]);
  });
});

describe("callContacts", () => {
  it("rings a tagged parent directly", () => {
    const title = tagToken({ kind: "parent", id: GIORGOS, label: "Γιώργος" });
    expect(callContacts(title, directory)).toEqual([
      { name: "Γιώργος Παπαδόπουλος", role: "parent", phone: "+306900000002" },
    ]);
  });

  it("offers a tagged student's family, primary parent first, once each", () => {
    const title = `${tagToken({ kind: "student", id: MARIA, label: "Μαρία" })} ${tagToken({ kind: "parent", id: ELENI, label: "Ελένη" })}`;
    expect(callContacts(title, directory).map((contact) => contact.phone)).toEqual([
      "+306900000001",
      "+306900000002",
      "+306900000003",
    ]);
  });

  it("has nothing to ring for a class or someone no longer in the directory", () => {
    const title = `${tagToken({ kind: "class", id: CLASS, label: "Β" })} ${tagToken({ kind: "parent", id: "55555555-5555-5555-5555-555555555555", label: "Old" })}`;
    expect(callContacts(title, directory)).toEqual([]);
  });
});

describe("markers", () => {
  it("reads a contact with + and a test or homework with #", () => {
    const title = `Ζήτα από ${tagToken({ kind: "contact", id: SUPPLIER, label: "Νίκας" })} για ${tagToken({ kind: "homework", id: HOMEWORK, label: "Β Λυκείου · 5/11" })}`;
    expect(plainTitle(title)).toBe("Ζήτα από +Νίκας για #Β Λυκείου · 5/11");
    expect(tagsIn(title).map((tag) => tag.kind)).toEqual(["contact", "homework"]);
  });

  it("encodes a picked + or # tag where its marker stands", () => {
    const title = encodeTitle("Διόρθωσε #Διαγώνισμα Άλγεβρας", [
      { kind: "assessment", id: TEST, label: "Διαγώνισμα Άλγεβρας" },
    ]);
    expect(title).toBe(`Διόρθωσε @[Διαγώνισμα Άλγεβρας](assessment:${TEST})`);
  });

  it("searches only the kinds of the marker typed", () => {
    expect(searchDirectory(directory, "", "+").map((entry) => entry.id)).toEqual([SUPPLIER]);
    // The homework is named after its class; the test only mentions it.
    expect(searchDirectory(directory, "λυκ", "#").map((entry) => entry.kind)).toEqual(["homework", "assessment"]);
    // A homework's note words are searched, without accents.
    expect(searchDirectory(directory, "παραγωγ", "#").map((entry) => entry.id)).toEqual([HOMEWORK]);
    expect(searchDirectory(directory, "λυκ", "@").map((entry) => entry.kind)).toEqual(["class", "student"]);
  });

  it("rings a tagged contact", () => {
    const title = tagToken({ kind: "contact", id: SUPPLIER, label: "Νίκας" });
    expect(callContacts(title, directory)).toEqual([
      { name: "Χαρτοπωλείο Νίκας", role: "contact", phone: "+302101234567" },
    ]);
  });
});

describe("email tasks", () => {
  it("writes to a student's parents (primary first), then the student, once per address", () => {
    const title = `Στείλε τους βαθμούς στην ${tagToken({ kind: "student", id: MARIA, label: "Μαρία" })}`;
    expect(emailRecipients(title, withEmails)).toEqual(["eleni@example.gr", "maria@example.gr"]);
  });

  it("uses the task's words, without the tags, as the subject", () => {
    const title = `Ζήτα προσφορά από ${tagToken({ kind: "contact", id: SUPPLIER, label: "Νίκας" })} για μαρκαδόρους`;
    expect(emailSubject(title)).toBe("Ζήτα προσφορά από για μαρκαδόρους");
    expect(mailtoHref(title, directory)).toBe(
      `mailto:info@nikas.gr?subject=${encodeURIComponent("Ζήτα προσφορά από για μαρκαδόρους")}`,
    );
  });

  it("has no link when nobody tagged has an email", () => {
    expect(mailtoHref(tagToken({ kind: "class", id: CLASS, label: "Β" }), directory)).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import {
  callContacts,
  encodeTitle,
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

const directory: TaskDirectory = {
  entries: [
    { kind: "student", id: MARIA, name: "Μαρία Παπαδοπούλου", detail: "Β Λυκείου", phone: "+306900000003", familyId: "f1", isPrimary: false },
    { kind: "parent", id: GIORGOS, name: "Γιώργος Παπαδόπουλος", detail: "Parent of Μαρία", phone: "+306900000002", familyId: "f1", isPrimary: false },
    { kind: "parent", id: ELENI, name: "Ελένη Παπαδοπούλου", detail: "Parent of Μαρία", phone: "+306900000001", familyId: "f1", isPrimary: true },
    { kind: "class", id: CLASS, name: "Β Λυκείου", detail: "Class", phone: null, familyId: null, isPrimary: false },
  ],
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
    expect(mentionQuery("Call @ελ", 8)).toEqual({ start: 5, query: "ελ" });
    expect(mentionQuery("@", 1)).toEqual({ start: 0, query: "" });
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

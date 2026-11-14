import { describe, expect, it } from "vitest";

import {
  MAX_CLASS_FILE_BYTES,
  classFileHref,
  classFilePath,
  classFileProblem,
  defaultTitle,
  formatFileSize,
  isGoogleDriveLink,
  isOwnClassFilePath,
  normalizeLink,
  portalClassFiles,
  sortClassFiles,
} from "@/lib/class-files";

const T = "11111111-1111-1111-1111-111111111111";
const C = "c0000000-0000-0000-0000-000000000001";
const U = "a0000000-0000-0000-0000-00000000000a";

describe("class file paths", () => {
  it("builds <teacher>/<class>/<id>.pdf and accepts it back", () => {
    const path = classFilePath(T, C, U);
    expect(path).toBe(`${T}/${C}/${U}.pdf`);
    expect(isOwnClassFilePath(path, T, C)).toBe(true);
  });

  it("rejects someone else's folder, another class, and odd names", () => {
    expect(isOwnClassFilePath(`${C}/${C}/${U}.pdf`, T, C)).toBe(false);
    expect(isOwnClassFilePath(`${T}/other/${U}.pdf`, T, C)).toBe(false);
    expect(isOwnClassFilePath(`${T}/${C}/../x.pdf`, T, C)).toBe(false);
    expect(isOwnClassFilePath(`${T}/${C}/${U}.exe`, T, C)).toBe(false);
    expect(isOwnClassFilePath(`${T}/${C}/x/${U}.pdf`, T, C)).toBe(false);
  });
});

describe("classFileProblem", () => {
  it("accepts a PDF up to 20 MB", () => {
    expect(classFileProblem({ name: "a.pdf", type: "application/pdf", size: 1000 })).toBeNull();
    expect(classFileProblem({ name: "a.pdf", type: "", size: MAX_CLASS_FILE_BYTES })).toBeNull();
  });

  it("refuses other types, empty and too-big files", () => {
    expect(classFileProblem({ name: "a.png", type: "image/png", size: 10 })).toMatch(/PDF/);
    expect(classFileProblem({ name: "a.pdf", type: "application/pdf", size: 0 })).toMatch(/empty/);
    expect(
      classFileProblem({ name: "a.pdf", type: "application/pdf", size: MAX_CLASS_FILE_BYTES + 1 }),
    ).toMatch(/20 MB/);
  });
});

describe("links", () => {
  it("adds https:// and rejects non-links", () => {
    expect(normalizeLink("drive.google.com/file/d/x")).toBe("https://drive.google.com/file/d/x");
    expect(normalizeLink("  http://a.gr/x ")).toBe("http://a.gr/x");
    expect(normalizeLink("")).toBeNull();
    expect(normalizeLink("not a link")).toBeNull();
    expect(normalizeLink("javascript:alert(1)")).toBeNull();
  });

  it("spots Google Drive and Docs links", () => {
    expect(isGoogleDriveLink("https://drive.google.com/file/d/x")).toBe(true);
    expect(isGoogleDriveLink("https://docs.google.com/document/d/x")).toBe(true);
    expect(isGoogleDriveLink("https://example.com")).toBe(false);
    expect(isGoogleDriveLink(null)).toBe(false);
  });
});

describe("titles and sizes", () => {
  it("uses the typed title, else the file name without .pdf", () => {
    expect(defaultTitle("  Λύσεις ", "x.pdf")).toBe("Λύσεις");
    expect(defaultTitle("", "Κεφάλαιο 3.PDF")).toBe("Κεφάλαιο 3");
    expect(defaultTitle(null, null)).toBe("Αρχείο");
  });

  it("formats sizes", () => {
    expect(formatFileSize(500)).toBe("1 KB");
    expect(formatFileSize(830 * 1024)).toBe("830 KB");
    expect(formatFileSize(2.44 * 1024 * 1024)).toBe("2.4 MB");
    expect(formatFileSize(null)).toBe("");
  });
});

describe("sortClassFiles", () => {
  it("puts pinned first, then newest", () => {
    const rows = [
      { id: "old", pinned: false, created_at: "2026-11-01T10:00:00Z" },
      { id: "new", pinned: false, created_at: "2026-11-10T10:00:00Z" },
      { id: "pin", pinned: true, created_at: "2026-10-01T10:00:00Z" },
    ];
    expect(sortClassFiles(rows).map((row) => row.id)).toEqual(["pin", "new", "old"]);
  });
});

describe("portalClassFiles", () => {
  const base = {
    class_id: C,
    note: null,
    size_bytes: null,
    url: null,
    pinned: false,
    homework_id: null,
  };

  it("splits homework attachments from the class list and builds hrefs", () => {
    const { files, byHomework } = portalClassFiles(
      [
        { ...base, id: "f1", kind: "file", title: "Φυλλάδιο", size_bytes: 1000, created_at: "2026-11-10T10:00:00Z" },
        { ...base, id: "f2", kind: "link", title: "Drive", url: "https://drive.google.com/x", created_at: "2026-11-11T10:00:00Z" },
        { ...base, id: "f3", kind: "file", title: "Λύσεις", homework_id: "hw1", created_at: "2026-11-12T10:00:00Z" },
      ],
      new Map([[C, "Β Λυκείου"]]),
    );
    expect(files.map((file) => file.id)).toEqual(["f2", "f1"]);
    expect(files[0]).toMatchObject({ href: "https://drive.google.com/x", isDrive: true, className: "Β Λυκείου" });
    expect(files[1]).toMatchObject({ href: classFileHref("f1"), isDrive: false, kind: "file" });
    expect(byHomework.get("hw1")?.map((file) => file.id)).toEqual(["f3"]);
  });
});

import { describe, expect, it } from "vitest";
import { contactLinks, formatGreekPhone, normalizeGreekPhone } from "@/lib/teacher-app/phone";

describe("normalizeGreekPhone", () => {
  it.each([
    ["6912345678", "+306912345678"],
    ["69 1234 5678", "+306912345678"],
    ["691-234-5678", "+306912345678"],
    ["+30 691 234 5678", "+306912345678"],
    ["0030 6912345678", "+306912345678"],
    ["306912345678", "+306912345678"],
    ["2441012345", "+302441012345"],
    ["(2441) 012.345", "+302441012345"],
    ["+44 7700 900123", "+447700900123"],
  ])("%s → %s", (raw, e164) => {
    expect(normalizeGreekPhone(raw)).toBe(e164);
  });

  it.each([null, undefined, "", "   ", "12345", "691234567", "abc", "+12"])("rejects %j", (raw) => {
    expect(normalizeGreekPhone(raw)).toBeNull();
  });
});

describe("contactLinks", () => {
  it("offers call, SMS, Viber and WhatsApp for a mobile", () => {
    expect(contactLinks("+306912345678").map((l) => l.href)).toEqual([
      "tel:+306912345678",
      "sms:+306912345678",
      "viber://chat?number=%2B306912345678",
      "https://wa.me/306912345678",
    ]);
  });

  it("offers only a call for a Greek landline", () => {
    expect(contactLinks("+302441012345").map((l) => l.kind)).toEqual(["call"]);
  });

  it("formats Greek numbers for reading", () => {
    expect(formatGreekPhone("+306912345678")).toBe("+30 691 234 5678");
    expect(formatGreekPhone("+447700900123")).toBe("+447700900123");
  });
});

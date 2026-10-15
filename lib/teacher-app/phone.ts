/**
 * Phone numbers as stored (typed by hand: "69 1234 5678", "+30 6912345678",
 * "0030 2441012345", "2441-012345") → E.164 (+30…), and the links the
 * companion's contact menu opens. Greek numbers are 10 digits: mobiles start
 * with 69, landlines with 2.
 */

const E164 = /^\+\d{8,15}$/;

export function normalizeGreekPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const compact = raw.trim().replace(/[\s\-./()]/g, "");
  let candidate: string;
  if (compact.startsWith("+")) {
    candidate = compact;
  } else if (compact.startsWith("00")) {
    candidate = `+${compact.slice(2)}`;
  } else if (/^[26]\d{9}$/.test(compact)) {
    candidate = `+30${compact}`;
  } else if (/^30[26]\d{9}$/.test(compact)) {
    candidate = `+${compact}`;
  } else {
    return null;
  }
  return E164.test(candidate) ? candidate : null;
}

/** A Greek landline (+302…) can only be called - no SMS, Viber or WhatsApp. */
export function isGreekLandline(e164: string): boolean {
  return e164.startsWith("+302");
}

export type ContactLink = { kind: "call" | "sms" | "viber" | "whatsapp"; label: string; href: string };

export function contactLinks(e164: string): ContactLink[] {
  const call: ContactLink = { kind: "call", label: "Call", href: `tel:${e164}` };
  if (isGreekLandline(e164)) return [call];
  const digits = e164.slice(1);
  return [
    call,
    { kind: "sms", label: "SMS", href: `sms:${e164}` },
    { kind: "viber", label: "Viber", href: `viber://chat?number=%2B${digits}` },
    { kind: "whatsapp", label: "WhatsApp", href: `https://wa.me/${digits}` },
  ];
}

/** "+30 691 234 5678" - easier to read in the menu than the raw E.164. */
export function formatGreekPhone(e164: string): string {
  const match = /^\+30(\d{3})(\d{3})(\d{4})$/.exec(e164);
  return match ? `+30 ${match[1]} ${match[2]} ${match[3]}` : e164;
}

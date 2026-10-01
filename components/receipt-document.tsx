import { format } from "date-fns";
import { el } from "date-fns/locale";

import { formatEuro } from "@/lib/format-currency";
import type { BusinessProfile, Receipt } from "@/lib/types/database";

// Άρθρο 27 under ν. 5144/2024, which renumbered the VAT Code - this is
// the exemption previously cited as άρθρο 22 of ν. 2859/2000. The myDATA
// vatExemptionCategory code is 7 either way (see docs/mydata-integration.md);
// only the printed citation changed.
const VAT_NOTES: Record<string, string> = {
  exempt_article_27:
    "Χωρίς ΦΠΑ — απαλλαγή κατ' άρθρο 27 του Κώδικα ΦΠΑ (παράδοση ιδιαίτερων μαθημάτων).",
  // Receipts issued before the rename keep rendering their original wording.
  exempt_article_22:
    "Χωρίς ΦΠΑ — απαλλαγή κατ' άρθρο 22 του Κώδικα ΦΠΑ (παράδοση ιδιαίτερων μαθημάτων).",
};

const formatAmount = formatEuro;

/**
 * The printable receipt itself, in Greek - it's a legal document issued to
 * Greek customers, unlike the surrounding teacher console which is English.
 *
 * Laid out as an A5 portrait sheet (148 x 210 mm). The print stylesheet in
 * globals.css sets `@page { size: A5 portrait }` and the matching sheet size
 * and padding; on screen the sheet is 148 mm wide (shrinking to fit a narrow
 * container such as the parent portal's dialog) so what the teacher previews
 * is the proportion that comes out of the printer.
 *
 * The `receipt-print` class is what the print stylesheet keys off:
 * everything else on the page is hidden when printing, so "print" gives
 * paper and "save as PDF" from the same browser dialog without pulling in a
 * PDF-rendering dependency. Always light/black-on-white regardless of the
 * app's theme - a receipt is paper, not a UI surface.
 *
 * The logo is built here rather than shown as the horizontal logo SVG: the
 * dots come from modus-mark.svg and "Modus" plus the tagline are live text
 * in the logo's own Commissioner Bold (the `font-logo` class, @font-face in
 * globals.css - the console theme's body font is the system UI stack, so
 * the wordmark can't rely on inheriting it).
 * In the horizontal SVG the lettering is a small part of a drawing with
 * mostly empty space, so enlarging the image never made the letters
 * readable - this way the letters can be sized independently of the dots.
 *
 * A plain <img>, not next/image's <Image>, for the mark - the print
 * stylesheet hides everything outside .receipt-print by toggling
 * visibility, and next/image's wrapper/lazy-loading behavior is one more
 * thing that could interact oddly with that rather than a real benefit
 * here (this renders once, on demand, never above the fold on a real page).
 *
 * `isDemo` renders a "ΔΕΙΓΜΑ" band so a preview run from the Business tab
 * (see teacher-business-settings.tsx) can never be mistaken for a real
 * legal document if it's printed or saved.
 */
export function ReceiptDocument({
  receipt,
  business,
  isDemo = false,
}: {
  receipt: Receipt;
  business: BusinessProfile | null;
  isDemo?: boolean;
}) {
  return (
    <div className="receipt-print mx-auto flex w-full max-w-[148mm] flex-col bg-white p-[10mm] text-[11px] leading-snug text-black shadow-sm print:min-h-[210mm] print:shadow-none">
      {isDemo && (
        <div className="mb-3 border-2 border-dashed border-black/40 py-1 text-center text-[10px] font-bold tracking-[0.2em] text-black/60 print:text-black/70">
          ΔΕΙΓΜΑ — ΔΕΝ ΑΠΟΤΕΛΕΙ ΠΡΑΓΜΑΤΙΚΟ ΠΑΡΑΣΤΑΤΙΚΟ
        </div>
      )}

      <div className="border-b-2 border-brand pb-3">
        {/* Top row: logo left, title right. The business details sit in
            their own block below, NOT inside the logo's column: a long
            business name made that column as wide as the whole sheet and
            pushed the title onto its own line under the logo. The row only
            wraps when the container is genuinely too narrow (parent portal
            dialog); on the A5 sheet it always fits. */}
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
          <div className="flex min-w-0 items-center gap-[3mm]">
            {/* eslint-disable-next-line @next/next/no-img-element -- print document, see the file-level note on why next/image is skipped here */}
            <img
              src="/branding/modus-mark.svg"
              alt=""
              className="h-[21mm] w-auto shrink-0"
            />
            <div className="min-w-0">
              <p
                data-testid="receipt-wordmark"
                className="font-logo text-[32pt] font-bold leading-none tracking-[0.01em] text-[#2b2b2e]"
              >
                Modus
              </p>
              <p className="font-logo mt-[1.5mm] text-[7pt] font-bold tracking-[0.09em] text-[#5b5952]">
                ΦΡΟΝΤΙΣΤΗΡΙΟ ΜΑΘΗΜΑΤΙΚΩΝ
              </p>
            </div>
          </div>
          <div className="max-w-[48mm] shrink-0 space-y-1 text-right">
            <p className="text-sm font-bold leading-tight tracking-tight">
              ΑΠΟΔΕΙΞΗ ΠΑΡΟΧΗΣ ΥΠΗΡΕΣΙΩΝ
            </p>
            <p className="font-medium">
              Σειρά {receipt.series} · Αρ. {receipt.receipt_number}
            </p>
            <p className="text-black/70">
              {format(new Date(receipt.issue_date), "d MMMM yyyy", {
                locale: el,
              })}
            </p>
          </div>
        </div>

        <div className="mt-3 space-y-px">
          <p className="text-xs font-bold">
            {business?.business_name ?? "—"}
          </p>
          {business?.address && <p>{business.address}</p>}
          {(business?.postal_code || business?.city) && (
            <p>
              {[business?.postal_code, business?.city]
                .filter(Boolean)
                .join(" ")}
            </p>
          )}
          {business?.afm && <p>ΑΦΜ: {business.afm}</p>}
          {business?.doy && <p>ΔΟΥ: {business.doy}</p>}
          {business?.activity_code && <p>ΚΑΔ: {business.activity_code}</p>}
          {business?.phone && <p>Τηλ.: {business.phone}</p>}
        </div>
      </div>

      <div className="mt-4 space-y-px">
        <p className="font-semibold">Στοιχεία πελάτη</p>
        <p>{receipt.recipient_name}</p>
        {receipt.recipient_address && <p>{receipt.recipient_address}</p>}
        {receipt.recipient_afm && <p>ΑΦΜ: {receipt.recipient_afm}</p>}
      </div>

      <table className="mt-4 w-full border-collapse">
        <thead>
          <tr className="border-y-2 border-brand text-left">
            <th className="py-1.5 font-semibold">Περιγραφή</th>
            <th className="py-1.5 text-right font-semibold">Ποσό</th>
          </tr>
        </thead>
        <tbody>
          {receipt.lineItems.map((item) => (
            <tr
              key={item.id}
              className="break-inside-avoid border-b border-black/10"
            >
              <td className="py-1.5 pr-3">{item.description}</td>
              <td className="py-1.5 text-right tabular-nums">
                {formatAmount(item.amount)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-brand">
            <td className="py-2 text-right font-semibold">Σύνολο</td>
            <td className="py-2 text-right text-sm font-bold tabular-nums">
              {formatAmount(receipt.total_amount)}
            </td>
          </tr>
        </tfoot>
      </table>

      <p className="mt-3 text-[10px] text-black/70">
        {VAT_NOTES[receipt.vat_category] ?? "Χωρίς ΦΠΑ."}
      </p>

      {receipt.notes && (
        <p className="mt-3 whitespace-pre-wrap">{receipt.notes}</p>
      )}

      {receipt.mydata_mark && (
        <p className="mt-4 text-[10px] text-black/70">
          myDATA MARK: {receipt.mydata_mark}
        </p>
      )}

      {/* mt-auto pins the signature row to the bottom of the A5 sheet when
          printed; on screen the sheet is only as tall as its content. */}
      <div className="mt-10 flex items-end justify-between gap-4 print:mt-auto print:pt-10">
        <p className="text-[9px] tracking-wide text-black/40">
          Εκδόθηκε μέσω Modus
        </p>
        <div className="w-44 border-t border-black/40 pt-1 text-center text-[10px]">
          Υπογραφή / Σφραγίδα
        </div>
      </div>
    </div>
  );
}

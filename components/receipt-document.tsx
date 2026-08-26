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
 * The `receipt-print` class is what the print stylesheet in globals.css
 * keys off: everything else on the page is hidden when printing, so
 * "print" gives paper and "save as PDF" from the same browser dialog
 * without pulling in a PDF-rendering dependency. Always light/black-on-white
 * regardless of the app's theme - a receipt is paper, not a UI surface, and
 * print stylesheets force this anyway (see the .receipt-print rule).
 *
 * A plain <img>, not next/image's <Image>, for the logo - the print
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
    <div className="receipt-print mx-auto max-w-2xl bg-white p-8 text-black">
      {isDemo && (
        <div className="mb-4 border-2 border-dashed border-black/40 py-1.5 text-center text-xs font-bold tracking-[0.2em] text-black/60 print:text-black/70">
          ΔΕΙΓΜΑ — ΔΕΝ ΑΠΟΤΕΛΕΙ ΠΡΑΓΜΑΤΙΚΟ ΠΑΡΑΣΤΑΤΙΚΟ
        </div>
      )}

      <div className="flex items-start justify-between gap-6 border-b-2 border-brand pb-4">
        <div className="space-y-1.5 text-sm">
          {/* eslint-disable-next-line @next/next/no-img-element -- print document, see the file-level note on why next/image is skipped here */}
          <img
            src="/branding/modus-logo-horizontal.svg"
            alt=""
            className="h-8 w-auto"
          />
          <div className="space-y-0.5 pt-1">
            <p className="text-base font-bold">
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
        <div className="space-y-1 text-right text-sm">
          <p className="text-lg font-bold tracking-tight">
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

      <div className="mt-6 space-y-0.5 text-sm">
        <p className="font-semibold">Στοιχεία πελάτη</p>
        <p>{receipt.recipient_name}</p>
        {receipt.recipient_address && <p>{receipt.recipient_address}</p>}
        {receipt.recipient_afm && <p>ΑΦΜ: {receipt.recipient_afm}</p>}
      </div>

      <table className="mt-6 w-full border-collapse text-sm">
        <thead>
          <tr className="border-y-2 border-brand text-left">
            <th className="py-2 font-semibold">Περιγραφή</th>
            <th className="py-2 text-right font-semibold">Ποσό</th>
          </tr>
        </thead>
        <tbody>
          {receipt.lineItems.map((item) => (
            <tr key={item.id} className="border-b border-black/10">
              <td className="py-2">{item.description}</td>
              <td className="py-2 text-right tabular-nums">
                {formatAmount(item.amount)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-brand">
            <td className="py-3 text-right font-semibold">Σύνολο</td>
            <td className="py-3 text-right text-base font-bold tabular-nums">
              {formatAmount(receipt.total_amount)}
            </td>
          </tr>
        </tfoot>
      </table>

      <p className="mt-4 text-xs text-black/70">
        {VAT_NOTES[receipt.vat_category] ?? "Χωρίς ΦΠΑ."}
      </p>

      {receipt.notes && (
        <p className="mt-4 whitespace-pre-wrap text-sm">{receipt.notes}</p>
      )}

      {receipt.mydata_mark && (
        <p className="mt-6 text-xs text-black/70">
          myDATA MARK: {receipt.mydata_mark}
        </p>
      )}

      <div className="mt-12 flex items-end justify-between gap-6">
        <p className="text-[10px] tracking-wide text-black/40">
          Εκδόθηκε μέσω Modus
        </p>
        <div className="w-56 border-t border-black/40 pt-1 text-center text-xs">
          Υπογραφή / Σφραγίδα
        </div>
      </div>
    </div>
  );
}

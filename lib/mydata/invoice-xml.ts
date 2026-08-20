import type { BusinessProfile, Receipt } from "@/lib/types/database";

/**
 * Builds the InvoicesDoc XML for a receipt, per the official AADE XSD
 * bundle v2.0.2 (see docs/mydata-integration.md).
 *
 * Hand-rolled rather than via a myDATA library: we emit exactly one
 * document shape (11.2, VAT-exempt, single issuer), and the available
 * community libraries are thin and unmaintained for something that files
 * tax records.
 *
 * Element ORDER is significant - every complexType in the schema is an
 * xs:sequence, so a correctly-named element in the wrong position is
 * rejected. The order here follows InvoicesDoc-v2.0.2.xsd exactly.
 */

// Namespaces are copied verbatim from the XSDs. Note the asymmetry: the
// invoice namespace is http, the classification one is https AND contains
// AADE's own misspelling of "Classificaton". Both are load-bearing.
const NS_INVOICE = "http://www.aade.gr/myDATA/invoice/v1.0";
const NS_INCOME_CLASSIFICATION =
  "https://www.aade.gr/myDATA/incomeClassificaton/v1.0";

export const INVOICE_TYPE_SERVICES_RECEIPT = "11.2";
export const VAT_CATEGORY_EXEMPT = 7;
/** Άρθρο 27 (ν. 5144/2024), formerly άρθρο 22 - the code is 7 under both. */
export const VAT_EXEMPTION_ARTICLE_27 = 7;
export const INCOME_CLASSIFICATION_TYPE_RETAIL_SERVICES = "E3_561_003";
export const INCOME_CLASSIFICATION_CATEGORY_SERVICES = "category1_3";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** AADE's AmountType is 2-decimal; send it explicitly rather than relying on JS formatting. */
function amount(value: number): string {
  return value.toFixed(2);
}

export interface BuildInvoiceXmlInput {
  receipt: Receipt;
  business: BusinessProfile;
}

export function buildInvoiceXml({
  receipt,
  business,
}: BuildInvoiceXmlInput): string {
  if (!business.afm) {
    throw new Error("Business ΑΦΜ is required to transmit to myDATA");
  }

  const total = Number(receipt.total_amount);

  const lines = receipt.lineItems
    .map((item, index) => {
      const net = Number(item.amount);
      return [
        `      <invoiceDetails>`,
        `        <lineNumber>${index + 1}</lineNumber>`,
        // No itemDescr: AADE's validator rejects it outright for 11.2
        // ("itemDescr is forbidden"). Retail receipts report amounts, not
        // an itemisation - the description still prints on the paper
        // receipt, it just isn't transmitted.
        `        <netValue>${amount(net)}</netValue>`,
        `        <vatCategory>${VAT_CATEGORY_EXEMPT}</vatCategory>`,
        `        <vatAmount>0.00</vatAmount>`,
        // Required precisely when vatCategory is 7, and forbidden otherwise
        // (validation error 271).
        `        <vatExemptionCategory>${VAT_EXEMPTION_ARTICLE_27}</vatExemptionCategory>`,
        `        <incomeClassification>`,
        `          <icls:classificationType>${INCOME_CLASSIFICATION_TYPE_RETAIL_SERVICES}</icls:classificationType>`,
        `          <icls:classificationCategory>${INCOME_CLASSIFICATION_CATEGORY_SERVICES}</icls:classificationCategory>`,
        `          <icls:amount>${amount(net)}</icls:amount>`,
        `        </incomeClassification>`,
        `      </invoiceDetails>`,
      ].join("\n");
    })
    .join("\n");


  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<InvoicesDoc xmlns="${NS_INVOICE}" xmlns:icls="${NS_INCOME_CLASSIFICATION}">`,
    `  <invoice>`,
    `    <issuer>`,
    `      <vatNumber>${escapeXml(business.afm)}</vatNumber>`,
    `      <country>GR</country>`,
    `      <branch>0</branch>`,
    `    </issuer>`,
    // counterpart is deliberately omitted: 11.2 is a retail receipt to a
    // private individual, who has no ΑΦΜ to report. Including a blank or
    // placeholder party would be worse than leaving it out - the schema
    // marks it optional precisely for this case.
    `    <invoiceHeader>`,
    `      <series>${escapeXml(receipt.series)}</series>`,
    `      <aa>${receipt.receipt_number}</aa>`,
    `      <issueDate>${receipt.issue_date}</issueDate>`,
    `      <invoiceType>${INVOICE_TYPE_SERVICES_RECEIPT}</invoiceType>`,
    `      <currency>EUR</currency>`,
    `    </invoiceHeader>`,
    // Mandatory for 11.2 per AADE's validator, despite the XSD marking it
    // optional - the per-invoice-type rules are stricter than the schema.
    // Sits between invoiceHeader and invoiceDetails, per the sequence.
    `    <paymentMethods>`,
    `      <paymentMethodDetails>`,
    `        <type>${receipt.payment_method}</type>`,
    `        <amount>${amount(total)}</amount>`,
    `      </paymentMethodDetails>`,
    `    </paymentMethods>`,
    lines,
    `    <invoiceSummary>`,
    `      <totalNetValue>${amount(total)}</totalNetValue>`,
    `      <totalVatAmount>0.00</totalVatAmount>`,
    `      <totalWithheldAmount>0.00</totalWithheldAmount>`,
    `      <totalFeesAmount>0.00</totalFeesAmount>`,
    `      <totalStampDutyAmount>0.00</totalStampDutyAmount>`,
    `      <totalOtherTaxesAmount>0.00</totalOtherTaxesAmount>`,
    `      <totalDeductionsAmount>0.00</totalDeductionsAmount>`,
    `      <totalGrossValue>${amount(total)}</totalGrossValue>`,
    `      <incomeClassification>`,
    `        <icls:classificationType>${INCOME_CLASSIFICATION_TYPE_RETAIL_SERVICES}</icls:classificationType>`,
    `        <icls:classificationCategory>${INCOME_CLASSIFICATION_CATEGORY_SERVICES}</icls:classificationCategory>`,
    `        <icls:amount>${amount(total)}</icls:amount>`,
    `      </incomeClassification>`,
    `    </invoiceSummary>`,
    `  </invoice>`,
    `</InvoicesDoc>`,
  ].join("\n");
}

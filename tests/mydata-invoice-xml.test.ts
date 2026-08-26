import { describe, expect, it } from "vitest";
import { buildInvoiceXml } from "@/lib/mydata/invoice-xml";
import { parseMyDataResponse, parseRequestedDocs } from "@/lib/mydata/client";
import type { BusinessProfile, Receipt } from "@/lib/types/database";

const business: BusinessProfile = {
  id: 1,
  business_name: "Modus",
  afm: "123456789",
  doy: "Α ΑΘΗΝΩΝ",
  activity_code: "85.59",
  address: "Οδός 1",
  city: "Αθήνα",
  postal_code: "12345",
  phone: "2100000000",
  updated_at: "2026-08-20T00:00:00Z",
};

const receipt: Receipt = {
  id: "receipt-1",
  series: "Α",
  receipt_number: 7,
  issue_date: "2026-08-20",
  recipient_name: "Γιώργος Παπαδόπουλος",
  recipient_afm: null,
  recipient_address: null,
  family_id: null,
  total_amount: 180.5,
  vat_category: "exempt_article_27",
  payment_method: 3,
  notes: null,
  mydata_status: "not_submitted",
  mydata_mark: null,
  mydata_uid: null,
  mydata_error: null,
  mydata_submitted_at: null,
  mydata_environment: null,
  mydata_last_verified_at: null,
  mydata_last_verified_ok: null,
  emailed_at: null,
  created_at: "2026-08-20T00:00:00Z",
  lineItems: [
    {
      id: "l1",
      student_id: null,
      description: "Δίδακτρα Σεπτεμβρίου",
      amount: 150,
      order_index: 0,
    },
    {
      id: "l2",
      student_id: null,
      description: "Εγγραφή",
      amount: 30.5,
      order_index: 1,
    },
  ],
};

describe("buildInvoiceXml", () => {
  const xml = buildInvoiceXml({ receipt, business });

  it("uses the exact namespaces from the AADE XSDs", () => {
    // The invoice namespace is http, the classification one is https and
    // contains AADE's own misspelling. Both are load-bearing - a "tidied"
    // version would be rejected.
    expect(xml).toContain('xmlns="http://www.aade.gr/myDATA/invoice/v1.0"');
    expect(xml).toContain(
      'xmlns:icls="https://www.aade.gr/myDATA/incomeClassificaton/v1.0"',
    );
  });

  it("declares the receipt as invoice type 11.2 with the issuer's ΑΦΜ", () => {
    expect(xml).toContain("<invoiceType>11.2</invoiceType>");
    expect(xml).toContain("<vatNumber>123456789</vatNumber>");
    expect(xml).toContain("<country>GR</country>");
  });

  it("carries the series and number as issued", () => {
    expect(xml).toContain("<series>Α</series>");
    expect(xml).toContain("<aa>7</aa>");
    expect(xml).toContain("<issueDate>2026-08-20</issueDate>");
  });

  it("omits counterpart, since a retail receipt has no reportable recipient", () => {
    expect(xml).not.toContain("<counterpart>");
  });

  it("marks every line VAT-exempt with the exemption category", () => {
    // vatExemptionCategory is required exactly when vatCategory is 7;
    // omitting it is validation error 271.
    const lineCount = (xml.match(/<vatCategory>7<\/vatCategory>/g) ?? []).length;
    expect(lineCount).toBe(2);
    expect(
      (xml.match(/<vatExemptionCategory>7<\/vatExemptionCategory>/g) ?? [])
        .length,
    ).toBe(2);
    expect(xml).not.toContain("<vatAmount>0</vatAmount>");
    expect(xml).toContain("<vatAmount>0.00</vatAmount>");
  });

  it("numbers lines from 1 and carries their amounts", () => {
    expect(xml).toContain("<lineNumber>1</lineNumber>");
    expect(xml).toContain("<lineNumber>2</lineNumber>");
    expect(xml).toContain("<netValue>150.00</netValue>");
    expect(xml).toContain("<netValue>30.50</netValue>");
  });

  it("omits itemDescr, which AADE forbids on this invoice type", () => {
    // Confirmed by the sandbox validator: "Invoice Line Number: 1.
    // itemDescr is forbidden". Retail receipts report amounts, not an
    // itemisation - descriptions still print on the paper receipt.
    expect(xml).not.toContain("<itemDescr>");
    expect(xml).not.toContain("Δίδακτρα Σεπτεμβρίου");
  });

  it("includes paymentMethods, which AADE requires on this invoice type", () => {
    // Also from the validator: "Payment Methods is mandatory for this
    // invoice type" - stricter than the XSD, which marks it optional.
    expect(xml).toContain("<paymentMethods>");
    expect(xml).toContain("<type>3</type>");
    expect(xml).toContain("<amount>180.50</amount>");
  });

  it("sends the payment method actually recorded on the receipt", () => {
    // Not hardcoded: filing "cash" for a card payment would be filing
    // something untrue.
    const byCard = buildInvoiceXml({
      receipt: { ...receipt, payment_method: 7 },
      business,
    });
    expect(byCard).toContain("<type>7</type>");
  });

  it("places paymentMethods between the header and the lines", () => {
    const header = xml.indexOf("<invoiceHeader>");
    const payment = xml.indexOf("<paymentMethods>");
    const details = xml.indexOf("<invoiceDetails>");
    expect(payment).toBeGreaterThan(header);
    expect(details).toBeGreaterThan(payment);
  });

  it("classifies income as retail services", () => {
    expect(xml).toContain(
      "<icls:classificationType>E3_561_003</icls:classificationType>",
    );
    expect(xml).toContain(
      "<icls:classificationCategory>category1_3</icls:classificationCategory>",
    );
  });

  it("totals net and gross to the receipt total, with zero VAT", () => {
    expect(xml).toContain("<totalNetValue>180.50</totalNetValue>");
    expect(xml).toContain("<totalGrossValue>180.50</totalGrossValue>");
    expect(xml).toContain("<totalVatAmount>0.00</totalVatAmount>");
  });

  it("orders invoiceHeader before invoiceDetails before invoiceSummary", () => {
    // Every complexType in the schema is an xs:sequence, so a correctly
    // named element in the wrong position is rejected.
    const header = xml.indexOf("<invoiceHeader>");
    const details = xml.indexOf("<invoiceDetails>");
    const summary = xml.indexOf("<invoiceSummary>");
    expect(header).toBeGreaterThan(-1);
    expect(details).toBeGreaterThan(header);
    expect(summary).toBeGreaterThan(details);
  });

  it("escapes XML metacharacters in issuer-supplied text", () => {
    // Descriptions no longer reach the payload, but the ΑΦΜ still does and
    // comes from a free-text field, so unescaped input would produce
    // malformed XML rather than a clean rejection.
    const escaped = buildInvoiceXml({
      receipt,
      business: { ...business, afm: 'A&B<"x">' },
    });

    expect(escaped).toContain(
      "<vatNumber>A&amp;B&lt;&quot;x&quot;&gt;</vatNumber>",
    );
  });

  it("refuses to build without the issuer's ΑΦΜ", () => {
    expect(() =>
      buildInvoiceXml({ receipt, business: { ...business, afm: null } }),
    ).toThrow(/ΑΦΜ/);
  });
});

describe("parseMyDataResponse", () => {
  it("extracts the MARK from a successful response", () => {
    const result = parseMyDataResponse(`
      <ResponseDoc>
        <response>
          <index>1</index>
          <invoiceUid>ABC123</invoiceUid>
          <invoiceMark>400001234567890</invoiceMark>
          <qrUrl>https://example.gr/qr</qrUrl>
          <statusCode>Success</statusCode>
        </response>
      </ResponseDoc>
    `);

    expect(result).toEqual({
      ok: true,
      mark: "400001234567890",
      uid: "ABC123",
      qrUrl: "https://example.gr/qr",
    });
  });

  it("treats a non-Success status as a failure even though AADE returned HTTP 200", () => {
    // The whole point: a naive response.ok check would record a rejected
    // filing as successful.
    const result = parseMyDataResponse(`
      <ResponseDoc>
        <response>
          <index>1</index>
          <statusCode>ValidationError</statusCode>
          <errors>
            <error>
              <message>Invalid vatExemptionCategory</message>
              <code>271</code>
            </error>
          </errors>
        </response>
      </ResponseDoc>
    `);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/Invalid vatExemptionCategory/);
    }
  });

  it("fails when a success status carries no MARK", () => {
    // Nothing was actually registered, so reporting success would leave a
    // silent gap in the filings.
    const result = parseMyDataResponse(
      `<ResponseDoc><response><statusCode>Success</statusCode></response></ResponseDoc>`,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/no MARK/i);
    }
  });

  it("reads namespace-prefixed responses", () => {
    const result = parseMyDataResponse(`
      <ns:ResponseDoc xmlns:ns="urn:x">
        <ns:response>
          <ns:invoiceMark>400009999999999</ns:invoiceMark>
          <ns:statusCode>Success</ns:statusCode>
        </ns:response>
      </ns:ResponseDoc>
    `);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.mark).toBe("400009999999999");
    }
  });
});

describe("parseRequestedDocs", () => {
  // Captured verbatim from a real RequestDocs call against production
  // (2026-08-24) - see the "Investigate myDATA expense classification"
  // Todoist item. Real supplier invoice, real ΑΦΜ pair, real amounts.
  const realResponse = `<?xml version="1.0" encoding="utf-8"?>
<RequestedDoc xmlns:icls="https://www.aade.gr/myDATA/incomeClassificaton/v1.0" xmlns:ecls="https://www.aade.gr/myDATA/expensesClassificaton/v1.0" xmlns:pm="https://www.aade.gr/myDATA/paymentMethod/v1.0" xmlns="http://www.aade.gr/myDATA/invoice/v1.0">
  <invoicesDoc>
    <invoice>
      <uid>7E36BDD55A768F3728BCBD946DEDC01DC03B7FCD</uid>
      <mark>400014966658660</mark>
      <authenticationCode>ADA740D745FC3009DB6F12CB4AD249F2DCD71056</authenticationCode>
      <issuer>
        <vatNumber>999082935</vatNumber>
        <country>GR</country>
        <branch>0</branch>
      </issuer>
      <counterpart>
        <vatNumber>133341926</vatNumber>
        <country>GR</country>
        <branch>0</branch>
        <address>
          <street>ΗΡΩΩΝ ΠΟΛΥΤΕΧΝΕΙΟΥ 3</street>
          <postalCode>43100</postalCode>
          <city>ΚΑΡΔΙΤΣΑ</city>
        </address>
      </counterpart>
      <invoiceHeader>
        <series>0</series>
        <aa>2100005704</aa>
        <issueDate>2026-08-24</issueDate>
        <invoiceType>2.1</invoiceType>
        <vatPaymentSuspension>false</vatPaymentSuspension>
        <currency>EUR</currency>
      </invoiceHeader>
      <paymentMethods>
        <paymentMethodDetails>
          <type>7</type>
          <amount>9.30</amount>
        </paymentMethodDetails>
      </paymentMethods>
      <invoiceDetails>
        <lineNumber>1</lineNumber>
        <netValue>7.5</netValue>
        <vatCategory>1</vatCategory>
        <vatAmount>1.80</vatAmount>
      </invoiceDetails>
      <invoiceSummary>
        <totalNetValue>7.5</totalNetValue>
        <totalVatAmount>1.80</totalVatAmount>
        <totalWithheldAmount>0</totalWithheldAmount>
        <totalFeesAmount>0</totalFeesAmount>
        <totalStampDutyAmount>0</totalStampDutyAmount>
        <totalOtherTaxesAmount>0</totalOtherTaxesAmount>
        <totalDeductionsAmount>0</totalDeductionsAmount>
        <totalGrossValue>9.30</totalGrossValue>
      </invoiceSummary>
      <qrCodeUrl>https://mydatapi.aade.gr/myDATA/TimologioQR/QRInfo?q=abc</qrCodeUrl>
      <downloadingInvoiceUrl>https://e-invoicing.gr/edocuments/ViewInvoice/-1/abc</downloadingInvoiceUrl>
    </invoice>
  </invoicesDoc>
</RequestedDoc>`;

  it("parses a real invoice's issuer, counterpart, and totals", () => {
    const invoices = parseRequestedDocs(realResponse);

    expect(invoices).toHaveLength(1);
    expect(invoices[0]).toMatchObject({
      uid: "7E36BDD55A768F3728BCBD946DEDC01DC03B7FCD",
      mark: "400014966658660",
      issuerVatNumber: "999082935",
      counterpartVatNumber: "133341926",
      issueDate: "2026-08-24",
      invoiceType: "2.1",
      currency: "EUR",
      totalNetValue: 7.5,
      totalVatAmount: 1.8,
      totalGrossValue: 9.3,
      paymentMethods: [{ type: 7, amount: 9.3 }],
    });
  });

  it("doesn't confuse issuer.vatNumber with counterpart.vatNumber", () => {
    // The whole reason for block-scoped extraction rather than a flat
    // extractTag: both blocks share the tag name.
    const [invoice] = parseRequestedDocs(realResponse);
    expect(invoice.issuerVatNumber).not.toBe(invoice.counterpartVatNumber);
    expect(invoice.issuerVatNumber).toBe("999082935");
    expect(invoice.counterpartVatNumber).toBe("133341926");
  });

  it("returns an empty array when no documents are on file", () => {
    const empty = `<?xml version="1.0" encoding="utf-8"?>
<RequestedDoc xmlns="http://www.aade.gr/myDATA/invoice/v1.0">
  <invoicesDoc>
  </invoicesDoc>
</RequestedDoc>`;

    expect(parseRequestedDocs(empty)).toEqual([]);
  });

  it("tolerates missing optional blocks without throwing", () => {
    // counterpart, address, and paymentMethods are all optional per §6.2.
    const noCounterpart = `<RequestedDoc>
  <invoicesDoc>
    <invoice>
      <uid>U1</uid>
      <mark>1</mark>
      <issuer><vatNumber>111111111</vatNumber></issuer>
      <invoiceHeader>
        <issueDate>2026-08-01</issueDate>
        <invoiceType>2.1</invoiceType>
        <currency>EUR</currency>
      </invoiceHeader>
      <invoiceSummary>
        <totalNetValue>10</totalNetValue>
        <totalVatAmount>2.4</totalVatAmount>
        <totalGrossValue>12.4</totalGrossValue>
      </invoiceSummary>
    </invoice>
  </invoicesDoc>
</RequestedDoc>`;

    const [invoice] = parseRequestedDocs(noCounterpart);
    expect(invoice.counterpartVatNumber).toBeNull();
    expect(invoice.paymentMethods).toEqual([]);
    expect(invoice.qrCodeUrl).toBeNull();
    expect(invoice.downloadingInvoiceUrl).toBeNull();
    expect(invoice.totalGrossValue).toBe(12.4);
  });

  it("parses multiple invoices in one response", () => {
    const two = `<RequestedDoc>
  <invoicesDoc>
    <invoice>
      <uid>U1</uid><mark>1</mark>
      <issuer><vatNumber>111111111</vatNumber></issuer>
      <invoiceHeader><issueDate>2026-08-01</issueDate><invoiceType>2.1</invoiceType><currency>EUR</currency></invoiceHeader>
      <invoiceSummary><totalNetValue>10</totalNetValue><totalVatAmount>2.4</totalVatAmount><totalGrossValue>12.4</totalGrossValue></invoiceSummary>
    </invoice>
    <invoice>
      <uid>U2</uid><mark>2</mark>
      <issuer><vatNumber>222222222</vatNumber></issuer>
      <invoiceHeader><issueDate>2026-08-02</issueDate><invoiceType>1.1</invoiceType><currency>EUR</currency></invoiceHeader>
      <invoiceSummary><totalNetValue>20</totalNetValue><totalVatAmount>4.8</totalVatAmount><totalGrossValue>24.8</totalGrossValue></invoiceSummary>
    </invoice>
  </invoicesDoc>
</RequestedDoc>`;

    const invoices = parseRequestedDocs(two);
    expect(invoices).toHaveLength(2);
    expect(invoices.map((i) => i.uid)).toEqual(["U1", "U2"]);
  });
});

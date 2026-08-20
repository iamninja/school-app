# myDATA (AADE) integration notes

Reference for the receipt-transmission work. Everything here is taken from
the **official** AADE sources supplied 2026-08-20 — `myDATA API
Documentation v2.0.2_preofficial_erp.pdf`, the `NEW_VERSION_2_0_2.zip`
XSD bundle, and `test_urls_0.pdf` — not from web search. Where earlier
web research disagreed with these, the official source won; two such
corrections are called out below.

## Channel and endpoints

We self-issue, so we are an **ERP** user, not a Provider.

| Environment | SendInvoices |
| --- | --- |
| Sandbox (dev) | `https://mydataapidev.aade.gr/SendInvoices` |
| Production | `https://mydatapi.aade.gr/SendInvoices` |

> **Correction to earlier research.** Web sources gave
> `.../myDATAProvider/SendInvoices`. That is the *Provider* channel and is
> the wrong path for us — it would have failed. The ERP paths have no
> path prefix at all.

Other ERP endpoints (same host): `CancelInvoice`,
`SendIncomeClassification`, `SendExpensesClassification`, `RequestDocs`,
`RequestTransmittedDocs`, `RequestMyIncome`, `RequestMyExpenses`.

Auth is two headers, `aade-user-id` and `ocp-apim-subscription-key`,
already stored per-environment in `private.integration_credentials`.

## Codes for our case (φροντιστήριο, ΑΠΥ to private individuals)

| Field | Value | Meaning |
| --- | --- | --- |
| `invoiceType` | `11.2` | Απόδειξη Παροχής Υπηρεσιών (§8.1, enum confirmed in `SimpleTypes-v2.0.2.xsd`) |
| `vatCategory` | `7` | Άνευ Φ.Π.Α. — 0% (§8.2) |
| `vatExemptionCategory` | `7` | See the Άρθρο 22 → 27 note below (§8.3) |
| `classificationType` | `E3_561_003` | Πωλήσεις αγαθών και υπηρεσιών Λιανικές — Ιδιωτική Πελατεία (§8.9) |
| `paymentMethod` | `3` cash · `7` POS/e-POS · `6` web banking (§8.12) |

`vatCategory` and `vatExemptionCategory` both being `7` is a coincidence —
they are different enumerations and must not be conflated.

### Άρθρο 22 is now Άρθρο 27 — decided 2026-08-20: use άρθρο 27

§8.3 lists exemption reasons in two columns: the old law (ν. 2859/2000),
**struck through**, and the current one (ν. 5144/2024). Code `7` is:

- old: *Χωρίς ΦΠΑ - άρθρο 22 του Κώδικα ΦΠΑ* ~~(struck through)~~
- new: *Χωρίς ΦΠΑ - άρθρο 27 του Κώδικα ΦΠΑ*

The whole VAT Code was renumbered (13→17, 14→18, 16→21, 19→24, **22→27**,
24→29, 25→30, 26→31, 27→32). **The myDATA code stays `7` either way**, so
transmission is unaffected — but the human-readable exemption wording
printed on the receipt is not.

**Resolved:** receipts now print *"απαλλαγή κατ' άρθρο 27 του Κώδικα
ΦΠΑ"*, and the stored identifier was renamed `exempt_article_22` →
`exempt_article_27` (migration `20260820160506`) so it can't contradict
what's printed.

`components/receipt-document.tsx` deliberately still recognises the old
identifier. A receipt already issued is a historical record: reprinting
one must reproduce the citation it carried when issued, not silently
restate it under the new law. Both cases are covered by tests in
`tests/teacher-receipts.test.tsx`.

## Structural rules worth remembering

- `vatExemptionCategory` is **required** when `vatCategory = 7`, and must
  be omitted otherwise (validation error 271).
- Income classification is submitted either per line, or as a summary
  total per type/category, or separately via `SendIncomeClassification`
  (§5.8). Per-line is simplest for us.
- `IncomeClassificationType` fields: `classificationType` (optional),
  `classificationCategory` (**required**), `amount` (required, ≥0, 2
  decimals), `id` (optional, serial within a line).

## Schema source of truth

The XSD bundle is authoritative over the PDF prose. Most relevant files:

- `InvoicesDoc-v2.0.2.xsd` — the invoice document structure
- `SimpleTypes-v2.0.2.xsd` — every enumeration and range
- `incomeClassification-v2.0.2.xsd`
- `response-v2.0.2.xsd` — response shape (MARK / UID / errors)

The PDF is permissions-locked, so the Read tool refuses it. `pdftotext`
extracts the Latin text fine but drops Greek (font encoding), so for
Greek tables render the page instead:

```bash
pdftoppm -f <page> -l <page> -r 130 -png "myDATA API Documentation v2.0.2_preofficial_erp.pdf" out
```

Note the PDF's printed page numbers run one behind the physical page
(printed 93 = physical 94).

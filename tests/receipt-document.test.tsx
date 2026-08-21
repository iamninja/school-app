import { render, screen } from "@testing-library/react";
import { ReceiptDocument } from "@/components/receipt-document";
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
  receipt_number: 1,
  issue_date: "2026-08-20",
  recipient_name: "Γιώργος Παπαδόπουλος",
  recipient_afm: null,
  recipient_address: null,
  family_id: null,
  total_amount: 150,
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
      id: "line-1",
      student_id: null,
      description: "Δίδακτρα Σεπτεμβρίου",
      amount: 150,
      order_index: 0,
    },
  ],
};

describe("ReceiptDocument", () => {
  it("renders the Modus logo", () => {
    const { container } = render(
      <ReceiptDocument receipt={receipt} business={business} />,
    );
    expect(
      container.querySelector('img[src="/branding/modus-logo-horizontal.svg"]'),
    ).not.toBeNull();
  });

  it("does not show a demo band for a real receipt", () => {
    render(<ReceiptDocument receipt={receipt} business={business} />);
    expect(screen.queryByText(/ΔΕΙΓΜΑ/)).not.toBeInTheDocument();
  });

  it("shows a ΔΕΙΓΜΑ band when isDemo is set", () => {
    render(<ReceiptDocument receipt={receipt} business={business} isDemo />);
    expect(
      screen.getByText(/ΔΕΙΓΜΑ — ΔΕΝ ΑΠΟΤΕΛΕΙ ΠΡΑΓΜΑΤΙΚΟ ΠΑΡΑΣΤΑΤΙΚΟ/),
    ).toBeInTheDocument();
  });
});

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

import { TeacherBusinessSettings } from "@/components/teacher-business-settings";
import * as businessActions from "@/app/protected/teacher/business-settings-actions";

vi.mock("@/app/protected/teacher/business-settings-actions", () => ({
  getBusinessSettingsAction: vi.fn(),
  updateBusinessProfileAction: vi.fn(),
  updateIntegrationSettingsAction: vi.fn(),
  setCredentialAction: vi.fn(),
  deleteCredentialAction: vi.fn(),
  checkMyDataMarkAction: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const profile = {
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

describe("TeacherBusinessSettings demo receipt preview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("previews the demo receipt with the current saved business details", async () => {
    const user = userEvent.setup();
    render(
      <TeacherBusinessSettings
        initialProfile={profile}
        initialIntegrations={[]}
        initialCredentialStatuses={{}}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: /preview demo receipt/i }),
    );

    expect(
      screen.getByText(/ΔΕΙΓΜΑ — ΔΕΝ ΑΠΟΤΕΛΕΙ ΠΡΑΓΜΑΤΙΚΟ ΠΑΡΑΣΤΑΤΙΚΟ/),
    ).toBeInTheDocument();
    expect(screen.getByText("Modus")).toBeInTheDocument();
    expect(screen.getByText(/ΑΦΜ: 123456789/)).toBeInTheDocument();
  });

  it("reflects unsaved edits to the business name in the preview", async () => {
    const user = userEvent.setup();
    render(
      <TeacherBusinessSettings
        initialProfile={profile}
        initialIntegrations={[]}
        initialCredentialStatuses={{}}
      />,
    );

    const nameInput = screen.getByLabelText(/business name/i);
    await user.clear(nameInput);
    await user.type(nameInput, "Edited Name");
    await user.click(
      screen.getByRole("button", { name: /preview demo receipt/i }),
    );

    expect(screen.getByText("Edited Name")).toBeInTheDocument();
    expect(businessActions.updateBusinessProfileAction).not.toHaveBeenCalled();
  });

  it("returns to the Business tab from the preview", async () => {
    const user = userEvent.setup();
    render(
      <TeacherBusinessSettings
        initialProfile={profile}
        initialIntegrations={[]}
        initialCredentialStatuses={{}}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: /preview demo receipt/i }),
    );
    await user.click(screen.getByRole("button", { name: /back to business/i }));

    expect(screen.getByText("Business details")).toBeInTheDocument();
  });
});

describe("TeacherBusinessSettings - check a myDATA MARK", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the raw AADE response after checking a MARK", async () => {
    const user = userEvent.setup();
    vi.mocked(businessActions.checkMyDataMarkAction).mockResolvedValue({
      ok: true,
      mark: "400015102490640",
      uid: "some-uid",
      qrUrl: null,
      raw: "<RequestedDoc>only a stub, not a real AADE response</RequestedDoc>",
      warning: null,
      verification: { found: false, invoiceType: null, grossValue: null },
    });

    render(
      <TeacherBusinessSettings
        initialProfile={profile}
        initialIntegrations={[]}
        initialCredentialStatuses={{}}
      />,
    );

    await user.type(
      screen.getByPlaceholderText("MARK"),
      "400015102490640",
    );
    await user.click(screen.getByRole("button", { name: "Check" }));

    expect(businessActions.checkMyDataMarkAction).toHaveBeenCalledWith(
      "400015102490640",
      "production",
    );
    expect(
      await screen.findByText(/not found in aade/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "<RequestedDoc>only a stub, not a real AADE response</RequestedDoc>",
      ),
    ).toBeInTheDocument();
  });

  it("refuses to check without a MARK entered", async () => {
    const user = userEvent.setup();
    render(
      <TeacherBusinessSettings
        initialProfile={profile}
        initialIntegrations={[]}
        initialCredentialStatuses={{}}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Check" }));

    expect(businessActions.checkMyDataMarkAction).not.toHaveBeenCalled();
  });
});

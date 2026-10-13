import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/app/notifications/actions", () => ({
  getInboxAction: vi.fn(),
  markInboxReadAction: vi.fn(async () => {}),
}));

import { getInboxAction, markInboxReadAction } from "@/app/notifications/actions";
import { NotificationBell } from "@/components/notification-bell";

const items = [
  { id: "n1", title: "Νέα εργασία · Β1", body: "σελ. 42", url: "/student-dashboard", created_at: "2026-10-13T15:00:00Z", read_at: null },
  { id: "n2", title: "Νέος βαθμός", body: "Βαθμολογήθηκε το «Όρια».", url: "/student-dashboard", created_at: "2026-10-12T15:00:00Z", read_at: "2026-10-12T16:00:00Z" },
];

describe("NotificationBell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getInboxAction).mockResolvedValue(items);
  });

  it("shows how many notices are unread", async () => {
    render(<NotificationBell />);
    expect(await screen.findByRole("button", { name: "Ειδοποιήσεις (1 νέες)" })).toBeInTheDocument();
  });

  it("lists recent notices and marks them all read", async () => {
    const user = userEvent.setup();
    render(<NotificationBell />);
    await user.click(await screen.findByRole("button", { name: /Ειδοποιήσεις/ }));

    const list = await screen.findByRole("list");
    expect(within(list).getByText("Νέα εργασία · Β1")).toBeInTheDocument();
    expect(within(list).getByText("Βαθμολογήθηκε το «Όρια».")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Σήμανση όλων ως αναγνωσμένα" }));
    expect(markInboxReadAction).toHaveBeenCalledWith("all");
    expect(screen.getByRole("button", { name: "Ειδοποιήσεις" })).toBeInTheDocument();
  });

  it("says so when there's nothing yet", async () => {
    vi.mocked(getInboxAction).mockResolvedValue([]);
    const user = userEvent.setup();
    render(<NotificationBell />);
    await user.click(await screen.findByRole("button", { name: "Ειδοποιήσεις" }));
    expect(await screen.findByText("Δεν υπάρχουν ειδοποιήσεις.")).toBeInTheDocument();
  });

  it("isn't shown in the demo", () => {
    const { container } = render(<NotificationBell demoMode />);
    expect(container).toBeEmptyDOMElement();
    expect(getInboxAction).not.toHaveBeenCalled();
  });
});

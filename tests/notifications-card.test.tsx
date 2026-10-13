import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/app/notifications/actions", () => ({
  savePushSubscriptionAction: vi.fn(async () => {}),
  removePushSubscriptionAction: vi.fn(async () => {}),
}));

const ANDROID =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";
const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

type FakeSubscription = { endpoint: string; toJSON: () => unknown; unsubscribe: () => Promise<boolean> };

function setDevice({
  userAgent = ANDROID,
  permission = "default" as NotificationPermission,
  subscribed = false,
  registered = true,
} = {}) {
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue(userAgent);
  Object.defineProperty(navigator, "maxTouchPoints", { value: 5, configurable: true });
  window.matchMedia = vi.fn().mockImplementation(() => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;

  let subscription: FakeSubscription | null = subscribed
    ? { endpoint: "https://push.example/1", toJSON: () => ({ endpoint: "https://push.example/1" }), unsubscribe: vi.fn(async () => true) }
    : null;
  const pushManager = {
    getSubscription: vi.fn(async () => subscription),
    subscribe: vi.fn(async () => {
      subscription = { endpoint: "https://push.example/new", toJSON: () => ({ endpoint: "https://push.example/new" }), unsubscribe: vi.fn(async () => true) };
      return subscription;
    }),
  };
  const registration = { pushManager };
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: {
      getRegistration: vi.fn(async () => (registered ? registration : undefined)),
      ready: Promise.resolve(registration),
    },
  });
  Object.defineProperty(window, "PushManager", { configurable: true, value: function PushManager() {} });
  const NotificationMock = Object.assign(function Notification() {}, {
    permission,
    requestPermission: vi.fn(async () => "granted" as NotificationPermission),
  });
  Object.defineProperty(window, "Notification", { configurable: true, value: NotificationMock });
  return { pushManager };
}

async function loadCard(props: { demoMode?: boolean } = {}) {
  // The device state is module-level; a fresh module per test.
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQ");
  const { NotificationsCard } = await import("@/components/notifications-card");
  const actions = await import("@/app/notifications/actions");
  const view = render(<NotificationsCard {...props} />);
  return { view, actions };
}

describe("NotificationsCard", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("offers to turn notifications on, and saves the device when allowed", async () => {
    const user = userEvent.setup();
    const { pushManager } = setDevice();
    const { actions } = await loadCard();

    await user.click(await screen.findByRole("button", { name: "Ενεργοποίηση ειδοποιήσεων" }));

    expect(pushManager.subscribe).toHaveBeenCalledWith(
      expect.objectContaining({ userVisibleOnly: true }),
    );
    expect(actions.savePushSubscriptionAction).toHaveBeenCalledWith({ endpoint: "https://push.example/new" });
    expect(await screen.findByText("Ενεργές σε αυτή τη συσκευή.")).toBeInTheDocument();
  });

  it("turns them off for this device", async () => {
    const user = userEvent.setup();
    setDevice({ permission: "granted", subscribed: true });
    const { actions } = await loadCard();

    await user.click(await screen.findByRole("button", { name: "Απενεργοποίηση" }));
    expect(actions.removePushSubscriptionAction).toHaveBeenCalledWith("https://push.example/1");
    expect(await screen.findByRole("button", { name: "Ενεργοποίηση ειδοποιήσεων" })).toBeInTheDocument();
  });

  it("re-saves an existing subscription when the portal opens", async () => {
    setDevice({ permission: "granted", subscribed: true });
    const { actions } = await loadCard();
    await screen.findByText("Ενεργές σε αυτή τη συσκευή.");
    expect(actions.savePushSubscriptionAction).toHaveBeenCalledWith({ endpoint: "https://push.example/1" });
  });

  it("on an iPhone browser, asks to install the app first", async () => {
    setDevice({ userAgent: IPHONE });
    await loadCard();
    expect(await screen.findByText(/λειτουργούν μόνο μέσα από την\s+εγκατεστημένη εφαρμογή/)).toBeInTheDocument();
  });

  it("explains how to undo a block", async () => {
    setDevice({ permission: "denied" });
    await loadCard();
    expect(await screen.findByText(/είναι αποκλεισμένες/)).toBeInTheDocument();
  });

  it("stays hidden without a service worker (dev server) and in the demo", async () => {
    setDevice({ registered: false });
    const { view } = await loadCard();
    await waitFor(() => expect(view.container).toBeEmptyDOMElement());

    setDevice();
    const demo = await loadCard({ demoMode: true });
    expect(demo.view.container).toBeEmptyDOMElement();
  });
});

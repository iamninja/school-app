import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  INSTALL_CARD_DISMISSED_KEY,
  InstallAppCard,
  __resetInstallPromptForTests,
  detectInstallPlatform,
} from "@/components/install-app-card";

const UA = {
  iPhoneSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  iPhoneChrome:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1",
  iPhoneFacebook:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/470.0.0.40.97]",
  iPadDesktopMode:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  androidChrome:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
  desktopChrome:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
};

function setDevice({
  userAgent,
  standalone = false,
  touchPoints = 0,
}: {
  userAgent: string;
  standalone?: boolean;
  touchPoints?: number;
}) {
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue(userAgent);
  // jsdom has no maxTouchPoints, so it can't be spied on - define it.
  Object.defineProperty(navigator, "maxTouchPoints", {
    value: touchPoints,
    configurable: true,
  });
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: standalone && query === "(display-mode: standalone)",
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

/** What Android Chrome fires when the app can be installed. */
function fireInstallPrompt(outcome: "accepted" | "dismissed" = "accepted") {
  const event = new Event("beforeinstallprompt", { cancelable: true }) as Event & {
    prompt: ReturnType<typeof vi.fn>;
    userChoice: Promise<{ outcome: string }>;
  };
  event.prompt = vi.fn(async () => {});
  event.userChoice = Promise.resolve({ outcome });
  act(() => {
    window.dispatchEvent(event);
  });
  return event;
}

const originalMatchMedia = window.matchMedia;

describe("detectInstallPlatform", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.matchMedia = originalMatchMedia;
  });

  it.each([
    { name: "iPhone Safari", userAgent: UA.iPhoneSafari, touchPoints: 0, expected: "ios" },
    // Since iOS 16.4 other iOS browsers can add to the home screen too.
    { name: "iPhone Chrome", userAgent: UA.iPhoneChrome, touchPoints: 0, expected: "ios" },
    { name: "iPhone Facebook in-app browser", userAgent: UA.iPhoneFacebook, touchPoints: 0, expected: "ios-in-app" },
    // iPadOS reports a Mac user agent; the touch screen gives it away.
    { name: "iPad (desktop-mode user agent)", userAgent: UA.iPadDesktopMode, touchPoints: 5, expected: "ios" },
    { name: "Android Chrome", userAgent: UA.androidChrome, touchPoints: 5, expected: "android" },
    { name: "desktop Chrome", userAgent: UA.desktopChrome, touchPoints: 0, expected: "other" },
  ] as const)("$name -> $expected", ({ userAgent, touchPoints, expected }) => {
    setDevice({ userAgent, touchPoints });
    expect(detectInstallPlatform()).toBe(expected);
  });

  it("reports an already-installed app on any device", () => {
    setDevice({ userAgent: UA.androidChrome, standalone: true });
    expect(detectInstallPlatform()).toBe("installed");
  });
});

describe("InstallAppCard", () => {
  beforeEach(() => {
    window.localStorage.clear();
    __resetInstallPromptForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.matchMedia = originalMatchMedia;
  });

  it("shows the Share > Add to Home Screen steps on an iPhone", () => {
    setDevice({ userAgent: UA.iPhoneSafari });
    render(<InstallAppCard />);

    expect(screen.getByRole("heading", { name: "Εγκαταστήστε την εφαρμογή Modus" })).toBeInTheDocument();
    expect(screen.getByText(/Προσθήκη στην οθόνη Αφετηρίας/)).toBeInTheDocument();
    expect(screen.getByText(/συνδεθείτε μία φορά/)).toBeInTheDocument();
  });

  it("asks to open Safari when the page is inside an in-app browser", () => {
    setDevice({ userAgent: UA.iPhoneFacebook });
    render(<InstallAppCard />);

    expect(screen.getByText(/Ανοίξτε την στο\s+Safari/)).toBeInTheDocument();
    expect(screen.queryByText(/Προσθήκη στην οθόνη Αφετηρίας/)).not.toBeInTheDocument();
  });

  it("on Android without an install prompt yet, explains the browser menu", () => {
    setDevice({ userAgent: UA.androidChrome, touchPoints: 5 });
    render(<InstallAppCard />);

    expect(screen.getByText(/Εγκατάσταση εφαρμογής/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Εγκατάσταση" })).not.toBeInTheDocument();
  });

  it("on Android, offers an Install button once the browser allows it, and uses the prompt once", async () => {
    const user = userEvent.setup();
    setDevice({ userAgent: UA.androidChrome, touchPoints: 5 });
    render(<InstallAppCard />);

    const event = fireInstallPrompt();
    // Chrome's own mini-infobar is suppressed in favour of the card.
    expect(event.defaultPrevented).toBe(true);

    await user.click(screen.getByRole("button", { name: "Εγκατάσταση" }));

    expect(event.prompt).toHaveBeenCalledTimes(1);
    // A prompt can't be reused, so the button goes back to the instructions.
    expect(screen.queryByRole("button", { name: "Εγκατάσταση" })).not.toBeInTheDocument();
  });

  it("hides itself when the browser reports the app was just installed", () => {
    setDevice({ userAgent: UA.androidChrome, touchPoints: 5 });
    render(<InstallAppCard />);
    expect(screen.getByRole("heading", { name: /Εγκαταστήστε/ })).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new Event("appinstalled"));
    });

    expect(screen.queryByRole("heading", { name: /Εγκαταστήστε/ })).not.toBeInTheDocument();
  });

  it.each([
    ["inside the installed app", { userAgent: UA.iPhoneSafari, standalone: true }],
    ["on a desktop browser", { userAgent: UA.desktopChrome }],
  ])("is not shown %s", (_label, device) => {
    setDevice(device);
    const { container } = render(<InstallAppCard />);
    expect(container).toBeEmptyDOMElement();
  });

  it("is not shown in the demo", () => {
    setDevice({ userAgent: UA.iPhoneSafari });
    const { container } = render(<InstallAppCard demoMode />);
    expect(container).toBeEmptyDOMElement();
  });

  it("closes when dismissed and stays closed on this device", async () => {
    const user = userEvent.setup();
    setDevice({ userAgent: UA.iPhoneSafari });
    const { unmount } = render(<InstallAppCard />);

    await user.click(screen.getByRole("button", { name: "Απόκρυψη" }));

    expect(screen.queryByRole("heading", { name: /Εγκαταστήστε/ })).not.toBeInTheDocument();
    expect(window.localStorage.getItem(INSTALL_CARD_DISMISSED_KEY)).toBe("1");

    unmount();
    const { container } = render(<InstallAppCard />);
    expect(container).toBeEmptyDOMElement();
  });
});

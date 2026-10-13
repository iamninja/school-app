"use client";

import * as React from "react";
import { MoreVertical, PlusSquare, Share, Smartphone, X } from "lucide-react";

import { Button } from "@/components/ui/button";

// ---------------------------------------------------------------------------
// Which phone/browser is this, and is the app already installed?
// ---------------------------------------------------------------------------

export type InstallPlatform =
  | "installed" // already running as the installed app - nothing to offer
  | "ios" // iPhone/iPad browser that can "Add to Home Screen"
  | "ios-in-app" // Facebook/Instagram/Viber... in-app browser: must open Safari
  | "android"
  | "other"; // desktop etc. - the browser offers installation itself

// In-app browsers on iOS can't add to the home screen at all.
const IOS_IN_APP_BROWSER = /FBAN|FBAV|FB_IAB|Instagram|Viber|Line\/|MicroMessenger|GSA\//i;

export function detectInstallPlatform(): InstallPlatform {
  const nav = navigator as Navigator & { standalone?: boolean };
  const isStandalone =
    nav.standalone === true ||
    (typeof window.matchMedia === "function" &&
      window.matchMedia("(display-mode: standalone)").matches);
  if (isStandalone) return "installed";

  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac; a touch screen gives it away.
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (isIOS) {
    // Safari and, since iOS 16.4, Chrome/Firefox/Edge can all add to the
    // home screen from their share menu; in-app browsers can't.
    return IOS_IN_APP_BROWSER.test(ua) ? "ios-in-app" : "ios";
  }
  if (/Android/i.test(ua)) return "android";
  return "other";
}

// The platform never changes while the page is open, so this "store" has
// nothing to subscribe to; it exists so the value is read on the client only
// (null on the server and during hydration) without setting state in an
// effect.
const noopSubscribe = () => () => {};

function usePlatform(): InstallPlatform | null {
  return React.useSyncExternalStore(
    noopSubscribe,
    detectInstallPlatform,
    () => null,
  );
}

// ---------------------------------------------------------------------------
// Android/Chrome's install prompt. The browser fires `beforeinstallprompt`
// once, possibly before this component mounts, so it is captured as soon as
// this module loads and kept until used.
// ---------------------------------------------------------------------------

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let appInstalled = false;
const promptListeners = new Set<() => void>();

function notifyPromptListeners() {
  promptListeners.forEach((listener) => listener());
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    // Keep Chrome's own mini-infobar from appearing; the card offers it.
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    notifyPromptListeners();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    appInstalled = true;
    notifyPromptListeners();
  });
}

function subscribeToPrompt(listener: () => void) {
  promptListeners.add(listener);
  return () => {
    promptListeners.delete(listener);
  };
}

function useInstallPrompt() {
  const prompt = React.useSyncExternalStore(
    subscribeToPrompt,
    () => deferredPrompt,
    () => null,
  );
  const installed = React.useSyncExternalStore(
    subscribeToPrompt,
    () => appInstalled,
    () => false,
  );
  return { prompt, installed };
}

/** Test-only: reset the module-level prompt state between tests. */
export function __resetInstallPromptForTests() {
  deferredPrompt = null;
  appInstalled = false;
  notifyPromptListeners();
}

// ---------------------------------------------------------------------------
// "Don't show this again", remembered per device.
// ---------------------------------------------------------------------------

export const INSTALL_CARD_DISMISSED_KEY = "modus-install-card-dismissed";
const dismissListeners = new Set<() => void>();

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(INSTALL_CARD_DISMISSED_KEY) === "1";
  } catch {
    return false; // storage blocked (private mode): just show the card
  }
}

function subscribeToDismissed(listener: () => void) {
  dismissListeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    dismissListeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function dismissCard() {
  try {
    window.localStorage.setItem(INSTALL_CARD_DISMISSED_KEY, "1");
  } catch {
    // Can't remember it; it will simply show again next time.
  }
  dismissListeners.forEach((listener) => listener());
}

function useDismissed(): boolean {
  // On the server, treat it as dismissed so the card never flashes in and
  // out while the page hydrates.
  return React.useSyncExternalStore(subscribeToDismissed, readDismissed, () => true);
}

// ---------------------------------------------------------------------------
// The card
// ---------------------------------------------------------------------------

/**
 * Invites families to install Modus to their phone's home screen, with the
 * steps for their own phone. Shown at the top of the parent and student
 * portals; hidden once installed, on desktop, in the demo, or after "close".
 */
export function InstallAppCard({ demoMode = false }: { demoMode?: boolean }) {
  const platform = usePlatform();
  const dismissed = useDismissed();
  const { prompt, installed } = useInstallPrompt();
  const [isPrompting, setIsPrompting] = React.useState(false);

  if (
    demoMode ||
    dismissed ||
    installed ||
    platform === null ||
    platform === "installed" ||
    platform === "other"
  ) {
    return null;
  }

  const handleInstall = async () => {
    if (!prompt) return;
    setIsPrompting(true);
    try {
      await prompt.prompt();
      await prompt.userChoice;
    } finally {
      // A prompt can only be used once, whatever the answer.
      deferredPrompt = null;
      notifyPromptListeners();
      setIsPrompting(false);
    }
  };

  return (
    <section
      aria-labelledby="install-app-title"
      className="relative rounded-2xl border border-brand/40 bg-brand/10 p-5"
    >
      <button
        type="button"
        onClick={dismissCard}
        aria-label="Απόκρυψη"
        className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground hover:text-foreground"
      >
        <X className="size-4" aria-hidden="true" />
      </button>

      <div className="flex items-start gap-3 pr-6">
        <Smartphone className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden="true" />
        <div className="space-y-2">
          <h2 id="install-app-title" className="text-base font-semibold">
            Εγκαταστήστε την εφαρμογή Modus
          </h2>
          <p className="text-sm text-muted-foreground">
            Ανοίγει με ένα πάτημα από την αρχική οθόνη του κινητού σας, σαν
            κανονική εφαρμογή.
          </p>

          {platform === "ios" && (
            <>
              <ol className="list-decimal space-y-1 pl-5 text-sm">
                <li>
                  Πατήστε το κουμπί Κοινοποίησης{" "}
                  <Share className="inline size-4 align-text-bottom" aria-label="Κοινοποίηση" />
                </li>
                <li>
                  Επιλέξτε «Προσθήκη στην οθόνη Αφετηρίας»{" "}
                  <PlusSquare className="inline size-4 align-text-bottom" aria-hidden="true" />
                </li>
                <li>Πατήστε «Προσθήκη».</li>
              </ol>
              <p className="text-xs text-muted-foreground">
                Μετά την εγκατάσταση, ανοίξτε την εφαρμογή από την αρχική
                οθόνη και συνδεθείτε μία φορά.
              </p>
            </>
          )}

          {platform === "ios-in-app" && (
            <p className="text-sm">
              Αυτή η σελίδα άνοιξε μέσα από άλλη εφαρμογή. Ανοίξτε την στο
              Safari για να την εγκαταστήσετε.
            </p>
          )}

          {platform === "android" &&
            (prompt ? (
              <Button
                type="button"
                size="sm"
                onClick={() => void handleInstall()}
                disabled={isPrompting}
              >
                Εγκατάσταση
              </Button>
            ) : (
              <p className="text-sm">
                Ανοίξτε το μενού του προγράμματος περιήγησης{" "}
                <MoreVertical className="inline size-4 align-text-bottom" aria-label="μενού" /> και
                επιλέξτε «Εγκατάσταση εφαρμογής» ή «Προσθήκη στην αρχική οθόνη».
              </p>
            ))}
        </div>
      </div>
    </section>
  );
}

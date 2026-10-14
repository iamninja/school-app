"use client";

import * as React from "react";
import { detectInstallPlatform } from "@/components/install-app-card";
import {
  removePushSubscriptionAction,
  savePushSubscriptionAction,
} from "@/app/notifications/actions";
import { getErrorMessage } from "@/lib/expected-error";

/**
 * Whether THIS device receives notifications, and the actions to change it.
 * Shared by the families' notifications card and the teacher's App tab.
 */
export type PushDeviceState =
  | "loading"
  | "unavailable" // no service worker (dev server) or the server has no VAPID key
  | "unsupported" // the browser can't receive push at all
  | "needs-install" // iPhone/iPad: push works only inside the installed app
  | "blocked" // the person said "Block" - only the phone's settings can undo it
  | "off"
  | "on";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

let state: PushDeviceState = "loading";
let loadStarted = false;
const listeners = new Set<() => void>();

function setState(next: PushDeviceState) {
  state = next;
  listeners.forEach((listener) => listener());
}

async function currentRegistration() {
  if (!("serviceWorker" in navigator)) return undefined;
  return navigator.serviceWorker.getRegistration("/");
}

async function load() {
  try {
    const platform = detectInstallPlatform();
    if (platform === "ios" || platform === "ios-in-app") {
      setState("needs-install");
      return;
    }
    if (
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      !("Notification" in window)
    ) {
      setState("unsupported");
      return;
    }
    const registration = await currentRegistration();
    if (!VAPID_PUBLIC_KEY || !registration) {
      setState("unavailable");
      return;
    }
    if (Notification.permission === "denied") {
      setState("blocked");
      return;
    }
    const subscription = await registration.pushManager.getSubscription();
    if (subscription && Notification.permission === "granted") {
      setState("on");
      // Re-save on every visit: keeps the server's copy current if the
      // browser changed it without telling us, and moves the device to
      // whoever is signed in now. Failure here is harmless.
      void savePushSubscriptionAction(subscription.toJSON()).catch(() => {});
    } else {
      setState("off");
    }
  } catch {
    setState("unsupported");
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!loadStarted) {
    loadStarted = true;
    void load();
  }
  return () => {
    listeners.delete(listener);
  };
}

/** Test-only: forget the cached state so the next render re-detects it. */
export function __resetPushDeviceForTests() {
  state = "loading";
  loadStarted = false;
}

/**
 * Called just before signing out: the next person to sign in on this
 * browser must not receive the previous person's notices. Never throws and
 * never holds up the sign-out for more than a couple of seconds.
 */
export async function forgetPushDeviceBeforeSignOut(): Promise<void> {
  const work = (async () => {
    const registration = await currentRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) return;
    await removePushSubscriptionAction(subscription.endpoint);
    await subscription.unsubscribe();
    setState("off");
  })().catch(() => {});
  await Promise.race([work, new Promise((resolve) => setTimeout(resolve, 2000))]);
}

/** The VAPID public key (base64url) as the bytes PushManager wants. */
function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const padded = (base64url + "===".slice((base64url.length + 3) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

export function usePushDevice() {
  const current = React.useSyncExternalStore(
    subscribe,
    () => state,
    () => "loading" as const,
  );
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const enable = async () => {
    setBusy(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "blocked" : "off");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: keyBytes(VAPID_PUBLIC_KEY),
        }));
      await savePushSubscriptionAction(subscription.toJSON());
      setState("on");
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Δεν ήταν δυνατή η ενεργοποίηση των ειδοποιήσεων."));
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    setError(null);
    try {
      const registration = await currentRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await removePushSubscriptionAction(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setState("off");
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Δεν ήταν δυνατή η απενεργοποίηση των ειδοποιήσεων."));
    } finally {
      setBusy(false);
    }
  };

  return { state: current, busy, error, enable, disable };
}

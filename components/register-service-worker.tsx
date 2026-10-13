"use client";

import * as React from "react";

/**
 * Registers the app's service worker (public/sw.js), which currently only
 * shows an offline page when a navigation fails - and is the base the
 * notifications phase will add push handling to. Production only: a service
 * worker on the dev server would sit between you and hot reloading.
 *
 * Renders nothing.
 */
export function RegisterServiceWorker() {
  React.useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .catch(() => {
        // Not being able to register only means no offline page; the app
        // itself works exactly the same, so there is nothing to tell the
        // user.
      });
  }, []);

  return null;
}

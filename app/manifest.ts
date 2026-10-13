import type { MetadataRoute } from "next";
import { APP_BACKGROUND_COLOR } from "@/lib/app-colors";

/**
 * Makes Modus installable to the home screen (Android and iPhone). One app
 * for everyone: it opens at /start, which sends whoever is signed in to
 * their own portal (app/start/route.ts). Served at /manifest.webmanifest;
 * the session proxy lets that path through without a login because browsers
 * fetch the manifest without cookies (proxy.ts).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/start",
    name: "Modus — Φροντιστήριο Μαθηματικών",
    short_name: "Modus",
    description:
      "Η πύλη του φροντιστηρίου Modus: πρόγραμμα, παρουσίες, εργασίες, διαγωνίσματα και λογαριασμός.",
    lang: "el",
    dir: "ltr",
    start_url: "/start",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: APP_BACKGROUND_COLOR,
    theme_color: APP_BACKGROUND_COLOR,
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}

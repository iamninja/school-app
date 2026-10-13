import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import manifest from "@/app/manifest";
import { config } from "@/proxy";
import { APP_BACKGROUND_COLOR } from "@/lib/app-colors";

const publicDir = path.join(process.cwd(), "public");

/** Width/height from a PNG file's IHDR chunk (bytes 16-23). */
function pngSize(file: string) {
  const buffer = readFileSync(file);
  expect(buffer.subarray(1, 4).toString("ascii")).toBe("PNG");
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

/**
 * The proxy matcher, the way Next.js applies it: the request path must match
 * the whole pattern for the proxy (and its session gate) to run.
 */
function proxyRunsFor(pathname: string) {
  const pattern = config.matcher[0];
  return new RegExp(`^${pattern}$`).test(pathname);
}

describe("app manifest", () => {
  const m = manifest();

  it("is one app, Modus, opening at the role-routing /start page", () => {
    expect(m.name).toBe("Modus — Φροντιστήριο Μαθηματικών");
    expect(m.short_name).toBe("Modus");
    expect(m.start_url).toBe("/start");
    expect(m.id).toBe("/start");
    expect(m.scope).toBe("/");
    expect(m.display).toBe("standalone");
    expect(m.lang).toBe("el");
  });

  it("uses the portals' paper background for the splash screen and status bar", () => {
    expect(m.background_color).toBe(APP_BACKGROUND_COLOR);
    expect(m.theme_color).toBe(APP_BACKGROUND_COLOR);
  });

  it("lists 192 and 512 icons plus a maskable one, and every file exists at its stated size", () => {
    const icons = m.icons ?? [];
    expect(icons.map((icon) => `${icon.sizes}:${icon.purpose}`)).toEqual([
      "192x192:any",
      "512x512:any",
      "512x512:maskable",
    ]);
    for (const icon of icons) {
      const file = path.join(publicDir, icon.src);
      expect(existsSync(file), `${icon.src} exists`).toBe(true);
      const [w, h] = String(icon.sizes).split("x").map(Number);
      expect(pngSize(file)).toEqual({ width: w, height: h });
    }
  });

  it("ships a 180x180 icon for the iPhone home screen", () => {
    expect(pngSize(path.join(publicDir, "icons", "apple-touch-icon.png"))).toEqual({
      width: 180,
      height: 180,
    });
  });
});

describe("files the installed app needs before anyone signs in", () => {
  it.each([
    "/manifest.webmanifest",
    "/sw.js",
    "/offline.html",
    "/icons/icon-192.png",
    "/icons/apple-touch-icon.png",
  ])("%s skips the session gate (browsers fetch it without a login)", (pathname) => {
    expect(proxyRunsFor(pathname)).toBe(false);
  });

  it.each(["/", "/start", "/parent-dashboard", "/student-dashboard", "/protected/teacher"])(
    "%s still goes through the session gate",
    (pathname) => {
      expect(proxyRunsFor(pathname)).toBe(true);
    },
  );

  it("has an offline page in Greek that needs nothing else to display", () => {
    const html = readFileSync(path.join(publicDir, "offline.html"), "utf8");
    expect(html).toContain('lang="el"');
    expect(html).toContain("Δεν υπάρχει σύνδεση στο διαδίκτυο");
    // No external stylesheet, script or image - none could load offline.
    expect(html).not.toMatch(/<link[^>]+stylesheet|<script[^>]+src=|<img[^>]+src=/i);
  });

  it("has a service worker that only answers page navigations and caches nothing but the offline page", () => {
    const sw = readFileSync(path.join(publicDir, "sw.js"), "utf8");
    expect(sw).toContain('request.mode !== "navigate"');
    expect(sw).toContain('request.method !== "GET"');
    // The only thing ever put in a cache is the offline page.
    expect(sw.match(/cache\.(add|addAll|put)\(/g)).toEqual(["cache.add("]);
    expect(sw).toContain('const OFFLINE_URL = "/offline.html"');
  });

  it("shows push notifications and only ever opens pages of this site", () => {
    const sw = readFileSync(path.join(publicDir, "sw.js"), "utf8");
    expect(sw).toContain('addEventListener("push"');
    expect(sw).toContain('addEventListener("notificationclick"');
    expect(sw).toContain('addEventListener("pushsubscriptionchange"');
    expect(sw).toContain("target.origin === self.location.origin");
  });

  it("ships a 96x96 monochrome badge for Android's status bar", () => {
    const badge = path.join(publicDir, "icons", "badge-96.png");
    expect(pngSize(badge)).toEqual({ width: 96, height: 96 });
    // Colour type 6 (RGBA): Android draws the badge from its transparency.
    expect(readFileSync(badge)[25]).toBe(6);
  });
});

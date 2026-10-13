// Generates the installable-app (PWA) icons in public/icons/ from the Modus
// mark (the three dots in public/branding/modus-mark.svg), inverted onto the
// brand's dark ink: paper-coloured dots where the mark has dark ones, the
// gold dot unchanged. Chosen over a paper-background version (2026-10-13)
// because it sits better on phone home screens, especially in dark mode; a
// home-screen icon can't change with the phone's theme, so there is one
// icon for both. The PNGs are committed; re-run this only when the mark or
// the colours change:
//
//   node scripts/generate-app-icons.mjs
//
// Uses sharp, which is already installed as a dependency of Next.js.
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "public", "icons");

// The brand's dark ink (the mark's dark dots, rgb 43,43,46) as the icon
// background, and the portals' paper colour (APP_BACKGROUND_COLOR in
// lib/app-colors.ts) for the two dots that are dark in the mark.
const BACKGROUND = "#2B2B2E";
const PAPER = "#F6F4EF";
const GOLD = "rgb(242,183,5)";

// The mark's circles, in its own 97x90 viewBox (modus-mark.svg).
const CIRCLES = [
  { cx: 48.249, cy: 24, r: 12, fill: PAPER },
  { cx: 24, cy: 66, r: 12, fill: PAPER },
  { cx: 72.497, cy: 66, r: 12, fill: GOLD },
];
// Bounding box of the three dots: x 12..84.497, y 12..78.
const MARK = { minX: 12, minY: 12, width: 72.497, height: 66 };

/**
 * A square icon: the dots centred on the dark background, scaled so the
 * dots span `fraction` of the icon's width.
 */
function iconSvg(size, fraction) {
  const scale = (size * fraction) / MARK.width;
  const offsetX = (size - MARK.width * scale) / 2 - MARK.minX * scale;
  const offsetY = (size - MARK.height * scale) / 2 - MARK.minY * scale;
  const dots = CIRCLES.map(
    (c) =>
      `<circle cx="${c.cx}" cy="${c.cy}" r="${c.r}" fill="${c.fill}"/>`,
  ).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${BACKGROUND}"/>
  <g transform="translate(${offsetX} ${offsetY}) scale(${scale})">${dots}</g>
</svg>`;
}

const ICONS = [
  // Regular icons: the dots fill most of the square.
  { file: "icon-192.png", size: 192, fraction: 0.62 },
  { file: "icon-512.png", size: 512, fraction: 0.62 },
  // Maskable: Android crops to a shape inside the central 80% circle, so the
  // dots stay well within it.
  { file: "icon-maskable-512.png", size: 512, fraction: 0.5 },
  // iPhone home screen. Opaque - iOS shows transparency as black.
  { file: "apple-touch-icon.png", size: 180, fraction: 0.6 },
];

await mkdir(outDir, { recursive: true });
for (const icon of ICONS) {
  const target = path.join(outDir, icon.file);
  await sharp(Buffer.from(iconSvg(icon.size, icon.fraction)))
    .flatten({ background: BACKGROUND })
    .png()
    .toFile(target);
  console.log(`wrote public/icons/${icon.file} (${icon.size}x${icon.size})`);
}

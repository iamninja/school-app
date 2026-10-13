// Colours for the installable app (PWA): the manifest (app/manifest.ts), the
// theme-color meta tags (app/layout.tsx) and the generated icons
// (scripts/generate-app-icons.mjs, which keeps its own copy because it runs
// outside the app).

// The portals' "paper" background (--background: 43 26% 95% in
// app/globals.css), so the splash screen and the phone's status bar blend
// into the app's own header instead of flashing a different colour.
export const APP_BACKGROUND_COLOR = "#F6F4EF";

// --background in dark mode (240 4% 10%, app/globals.css).
export const APP_BACKGROUND_COLOR_DARK = "#19191B";

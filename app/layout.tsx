import type { Metadata, Viewport } from "next";
import { Commissioner } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { RegisterServiceWorker } from "@/components/register-service-worker";
import {
  APP_BACKGROUND_COLOR,
  APP_BACKGROUND_COLOR_DARK,
} from "@/lib/app-colors";
import "./globals.css";
import "katex/dist/katex.min.css";

const defaultUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(defaultUrl),
  title: "Modus — Φροντιστήριο Μαθηματικών | Καρδίτσα",
  description:
    "Φροντιστήριο Μαθηματικών Modus — Βάγιος Βλάχος. Ηρώων Πολυτεχνείου 3, 1ος όροφος, Καρδίτσα. Πρόγραμμα, παρουσίες και διαγωνίσματα στην πύλη του φροντιστηρίου.",
  // Installable app (PWA): the manifest itself is app/manifest.ts. iPhones
  // ignore most of the manifest and read these instead when "Add to Home
  // Screen" is used - the name under the icon, the icon itself, and that it
  // should open full-screen without Safari's bars.
  applicationName: "Modus",
  appleWebApp: {
    capable: true,
    title: "Modus",
    statusBarStyle: "default",
  },
  icons: {
    apple: "/icons/apple-touch-icon.png",
  },
};

// Colours the phone's status bar / browser chrome to match the page
// background in each theme, so the installed app looks seamless.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: APP_BACKGROUND_COLOR },
    { media: "(prefers-color-scheme: dark)", color: APP_BACKGROUND_COLOR_DARK },
  ],
};

// Commissioner ships full Greek glyph coverage (Geist is latin-only, so all
// Greek copy previously fell back to the system font).
const commissioner = Commissioner({
  variable: "--font-commissioner",
  display: "swap",
  subsets: ["latin", "greek"],
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="el" suppressHydrationWarning>
      <body className={`${commissioner.className} antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster />
        </ThemeProvider>
        <RegisterServiceWorker />
      </body>
    </html>
  );
}

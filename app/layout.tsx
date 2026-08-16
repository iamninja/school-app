import type { Metadata } from "next";
import { Commissioner } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
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
      </body>
    </html>
  );
}

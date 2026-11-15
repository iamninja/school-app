import { Comfortaa } from "next/font/google";

// The rounded face for the game's big numbers (score, slider value,
// streak) - the "game" half of the Modus × game look. Greek included.
const comfortaa = Comfortaa({
  variable: "--font-round",
  display: "swap",
  subsets: ["latin", "greek"],
  weight: ["600", "700"],
});

export default function PracticeLayout({ children }: { children: React.ReactNode }) {
  return <div className={comfortaa.variable}>{children}</div>;
}

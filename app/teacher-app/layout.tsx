import type { Metadata } from "next";
import { CompanionShell } from "@/components/teacher-app/shell";
import { requireCompanionTeacher } from "@/app/teacher-app/session";

export const metadata: Metadata = {
  title: "Modus — Teacher",
};

export default async function TeacherAppLayout({ children }: { children: React.ReactNode }) {
  await requireCompanionTeacher();
  return <CompanionShell>{children}</CompanionShell>;
}

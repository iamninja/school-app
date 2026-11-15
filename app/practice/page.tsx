import type { Metadata } from "next";

import { PracticeGame } from "@/components/practice/practice-game";
import { getPracticeCatalog, getPracticeViewer } from "@/lib/practice-server";

export const metadata: Metadata = {
  title: "Εξάσκηση · Modus",
  description: "Γύροι 10 ερωτήσεων μαθηματικών για κάθε τάξη, όσες φορές θέλεις.",
};

export const dynamic = "force-dynamic";

/**
 * Practice: open to everyone. Guests (and parents) see the public
 * sections; the centre's students and the teacher see them all, and a
 * student starts at their own grade.
 */
export default async function PracticePage() {
  const viewer = await getPracticeViewer();
  const catalog = await getPracticeCatalog(viewer).catch(() => []);
  return (
    <PracticeGame
      catalog={catalog}
      viewer={viewer.kind === "student" ? { kind: "student", firstName: viewer.firstName, grade: viewer.grade } : { kind: viewer.kind }}
    />
  );
}

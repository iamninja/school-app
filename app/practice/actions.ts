"use server";

import { headers } from "next/headers";

import { drawPracticeRound, getPracticeViewer, type RoundQuestion } from "@/lib/practice-server";
import { allowDraw } from "@/lib/practice-rate-limit";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type DrawRoundResult =
  | { ok: true; questions: RoundQuestion[] }
  | { ok: false; error: string };

/**
 * A new practice round. Open to guests (public sections only); the
 * centre's students and the teacher can play every section. Sections and
 * past mistakes come from the player; only ids are taken from them, and
 * what they may see is decided on the server.
 */
export async function drawPracticeRoundAction(input: {
  sectionIds?: string[];
  mistakeIds?: string[];
  mistakesOnly?: boolean;
}): Promise<DrawRoundResult> {
  const sectionIds = (input.sectionIds ?? []).filter((id) => UUID.test(id)).slice(0, 100);
  const mistakeIds = (input.mistakeIds ?? []).filter((id) => UUID.test(id)).slice(0, 300);
  const mistakesOnly = Boolean(input.mistakesOnly);
  if (!mistakesOnly && sectionIds.length === 0) return { ok: false, error: "Διάλεξε τουλάχιστον μία ενότητα." };
  if (mistakesOnly && mistakeIds.length === 0) return { ok: false, error: "Δεν έχεις λάθη να ξαναδείς." };

  const requestHeaders = await headers();
  const ip = (requestHeaders.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  if (!allowDraw(ip)) {
    return { ok: false, error: "Πολλοί γύροι μέσα σε λίγο - περίμενε ένα λεπτό και ξαναδοκίμασε." };
  }

  const viewer = await getPracticeViewer();
  const questions = await drawPracticeRound(viewer, { sectionIds, mistakeIds, mistakesOnly });
  if (questions.length === 0) {
    return { ok: false, error: mistakesOnly ? "Τα λάθη σου δεν είναι πια διαθέσιμα." : "Δεν βρέθηκαν ερωτήσεις σε αυτές τις ενότητες." };
  }
  return { ok: true, questions };
}

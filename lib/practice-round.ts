// Drawing a practice round: which questions, in what order. Pure; tests in
// tests/practice-round.test.ts. The server (lib/practice-server.ts) feeds
// it the questions the player may see and turns the picks into
// PlayableQuestions.

import type { Rng } from "@/lib/practice-template";

export const ROUND_SIZE = 10;
/** At most this many of a round's questions come from the player's mistakes. */
export const MAX_MISTAKES_PER_ROUND = 4;

export function shuffle<T>(items: T[], rng: Rng = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Picks a round: a few of the player's past mistakes (those still in the
 * pool) come back, the rest are drawn at random without repeats, and the
 * whole round is shuffled. A pool smaller than the round gives a shorter
 * round rather than repeats.
 */
export function pickRound(
  poolIds: string[],
  mistakeIds: string[],
  rng: Rng = Math.random,
  size = ROUND_SIZE,
): string[] {
  const pool = [...new Set(poolIds)];
  const inPool = new Set(pool);
  const mistakes = shuffle([...new Set(mistakeIds)].filter((id) => inPool.has(id)), rng).slice(0, MAX_MISTAKES_PER_ROUND);
  const taken = new Set(mistakes);
  const rest = shuffle(pool.filter((id) => !taken.has(id)), rng).slice(0, Math.max(0, size - mistakes.length));
  return shuffle([...mistakes, ...rest], rng).slice(0, size);
}

/**
 * Puts multiple-choice options in a random order. The correct one stays
 * marked; nothing about its position is predictable.
 */
export function shuffleOptions<T extends { correct: boolean }>(options: T[], rng: Rng = Math.random): T[] {
  return shuffle(options, rng);
}

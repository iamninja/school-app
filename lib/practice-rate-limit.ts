// A light limit on drawing practice rounds, per IP and per server
// instance (best effort - serverless instances don't share memory). A
// round takes a minute or more to play; 30 draws in 5 minutes is far more
// than a person needs and stops a script from dumping the bank quickly.

const WINDOW_MS = 5 * 60 * 1000;
const MAX_DRAWS = 30;
const hits = new Map<string, number[]>();

function allow(key: string, max: number, now: number): boolean {
  const recent = (hits.get(key) ?? []).filter((time) => now - time < WINDOW_MS);
  if (recent.length >= max) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) {
    for (const [other, times] of hits) if (times.every((time) => now - time >= WINDOW_MS)) hits.delete(other);
  }
  return true;
}

export function allowDraw(key: string, now = Date.now()): boolean {
  return allow(`draw:${key}`, MAX_DRAWS, now);
}

/** Reports: 10 per 5 minutes per address. */
export function allowReport(key: string, now = Date.now()): boolean {
  return allow(`report:${key}`, 10, now);
}

/** AI checks of typed counterexamples: 10 per 5 minutes per address (the daily cap per student is in the database). */
export function allowAiCheck(key: string, now = Date.now()): boolean {
  return allow(`ai:${key}`, 10, now);
}

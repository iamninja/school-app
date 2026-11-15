// A light limit on drawing practice rounds, per IP and per server
// instance (best effort - serverless instances don't share memory). A
// round takes a minute or more to play; 30 draws in 5 minutes is far more
// than a person needs and stops a script from dumping the bank quickly.

const WINDOW_MS = 5 * 60 * 1000;
const MAX_DRAWS = 30;
const hits = new Map<string, number[]>();

export function allowDraw(key: string, now = Date.now()): boolean {
  const recent = (hits.get(key) ?? []).filter((time) => now - time < WINDOW_MS);
  if (recent.length >= MAX_DRAWS) {
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

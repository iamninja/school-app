import { timingSafeEqual } from "node:crypto";

/**
 * Shared-secret check for the scheduled-job routes, the same rule as
 * /api/cron/monthly-charges: `Authorization: Bearer $CRON_SECRET`, compared
 * in constant time, and a missing secret fails closed (500) rather than
 * meaning "no auth". Returns the error response to send, or null if the
 * request may proceed.
 */
export function rejectUnauthorizedCron(request: Request): Response | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  }
  const provided = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

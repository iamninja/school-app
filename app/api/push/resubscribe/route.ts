import { createClient } from "@/lib/supabase/server";
import {
  parseSubscription,
  replaceSubscription,
} from "@/lib/push/subscriptions";

export const dynamic = "force-dynamic";

/**
 * Called by the service worker (public/sw.js) when the browser replaces a
 * device's push subscription. A route handler rather than a server action
 * because a service worker can't call server actions. The session cookie
 * comes along with the request, and only a subscription the signed-in user
 * already owns can be replaced.
 */

/** The public VAPID key, for re-subscribing. It's public by design. */
export async function GET(): Promise<Response> {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!publicKey) return Response.json({ error: "Not configured" }, { status: 404 });
  return Response.json({ publicKey });
}

export async function POST(request: Request): Promise<Response> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: { oldEndpoint?: unknown; subscription?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid body" }, { status: 400 });
  }

  let subscription;
  try {
    subscription = parseSubscription(body.subscription);
  } catch {
    return Response.json({ error: "Invalid subscription" }, { status: 400 });
  }
  const oldEndpoint =
    typeof body.oldEndpoint === "string" && body.oldEndpoint.length <= 1000
      ? body.oldEndpoint
      : null;

  const replaced = await replaceSubscription(
    user.id,
    oldEndpoint,
    subscription,
    request.headers.get("user-agent"),
  );
  return replaced
    ? Response.json({ ok: true })
    : Response.json({ error: "Nothing to replace" }, { status: 404 });
}

import { createClient } from "@supabase/supabase-js";

/**
 * Talks to the LOCAL Supabase stack (`supabase start`), never the linked
 * remote project - deliberately separate from lib/supabase/server.ts,
 * which reads NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY pointing
 * at the real project. Values come from `supabase status` once the local
 * stack is running (see tests/rls/README.md) - not hardcoded, since these
 * are long JWTs that shouldn't be typed from memory.
 */
function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set - run "supabase start" then "supabase status" and set it (see tests/rls/README.md).`,
    );
  }
  return value;
}

/** Service-role client against the local stack - bypasses RLS, fixture setup/teardown only. */
export function serviceClient() {
  return createClient(
    requiredEnv("LOCAL_SUPABASE_URL"),
    requiredEnv("LOCAL_SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

/**
 * Signs in as a real fixture user against the local stack and returns a
 * client scoped to that session - every RLS assertion runs through this,
 * exactly like a real parent/teacher session, not a simulated one.
 */
export async function signInAs(email: string, password: string) {
  const client = createClient(
    requiredEnv("LOCAL_SUPABASE_URL"),
    requiredEnv("LOCAL_SUPABASE_ANON_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    throw new Error(`signInAs(${email}) failed: ${error.message}`);
  }
  return client;
}

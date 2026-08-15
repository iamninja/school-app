import { execSync } from "node:child_process";
import { describe, expect, it } from "vitest";

// Regression check for the seed.sql auth.users FK bug found 2026-08-15 -
// destructive (wipes and replays the local DB) and slow relative to the
// RLS policy checks, so this runs via its own `npm run test:seed` script
// rather than the routine `test:rls` iteration loop.
describe("local stack: db reset", () => {
  it(
    "completes cleanly with seeding enabled",
    () => {
      expect(() =>
        execSync("npx supabase db reset", { stdio: "pipe", timeout: 120000 }),
      ).not.toThrow();
    },
    120000,
  );
});

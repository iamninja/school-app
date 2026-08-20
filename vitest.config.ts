import path from "path";
import react from "@vitejs/plugin-react";
import { defaultExclude, defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./vitest.setup.ts",
    testTimeout: 15000,
    // tests/rls/** needs a running local Supabase stack (`supabase start`)
    // and is run separately via `npm run test:rls` (see vitest.rls.config.ts)
    // - excluded here so the default suite never depends on Docker/local
    // services being up. teacher-actions/teacher-quiz-actions mock
    // @/lib/supabase/server at the module level, which raced with this
    // file's isolate: false (confirmed flaky - a later file's vi.mock can
    // lose to an earlier file's cached module under a shared worker) - run
    // separately via `npm run test:unit` (see vitest.unit.config.ts).
    exclude: [
      ...defaultExclude,
      "tests/rls/**",
      "tests/teacher-actions.test.ts",
      "tests/teacher-quiz-actions.test.ts",
      "tests/student-dashboard-quiz-actions.test.ts",
      "tests/parent-actions.test.ts",
      "tests/student-actions.test.ts",
    ],
    // isolate: false previously let files sharing a worker reuse the same
    // jsdom environment and module graph (React/Radix/KaTeX etc.) instead of
    // reinitializing per file - measured as the dominant cost over actual
    // test execution. As anticipated in that original tuning note ("re-tune
    // if the suite grows a lot"), it did: at 13 files, two Dialog-heavy
    // dashboard test files landed in the same worker and one test's Radix
    // Dialog portal/body-scroll-lock state leaked into the next (confirmed
    // by running with --isolate, which made the whole suite pass
    // consistently; the failure only appeared under the default config, and
    // which two tests failed depended on how files happened to be bucketed
    // across workers - a real correctness risk, not just flakiness to
    // tolerate). Isolating trades a modest amount of speed for a suite
    // that passes the same way every time regardless of file count/order.
    isolate: true,
    pool: "threads",
    maxWorkers: 4,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});

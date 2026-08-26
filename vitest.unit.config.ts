import path from "path";
import { defineConfig } from "vitest/config";

// Server-action unit tests (tests/teacher-actions.test.ts,
// tests/teacher-quiz-actions.test.ts) mock @/lib/supabase/server at the
// module level - found this genuinely races with vitest.config.ts's
// isolate: false (files sharing a worker share a module cache, so
// whether a later file's vi.mock actually wins depends on load order -
// confirmed flaky, 1 failure in 3 runs of the shared suite). These don't
// need jsdom or the shared-module-graph speedup isolate: false exists
// for (no React rendering here), so they get their own default-isolated
// config instead of forcing the shared pool to accommodate them.
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: [
      "tests/teacher-actions.test.ts",
      "tests/teacher-quiz-actions.test.ts",
      "tests/student-dashboard-quiz-actions.test.ts",
      "tests/parent-actions.test.ts",
      "tests/student-actions.test.ts",
      "tests/business-settings-actions.test.ts",
      "tests/receipt-actions.test.ts",
      "tests/mydata-invoice-xml.test.ts",
      "tests/mydata-documents-actions.test.ts",
      "tests/expense-actions.test.ts",
      "tests/calendar-actions.test.ts",
      "tests/billing-actions.test.ts",
      "tests/cron-monthly-charges-route.test.ts",
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      // Same reasoning as vitest.config.ts: vitest has no RSC boundary
      // transform, so importing a server-only module throws by design.
      // next build still enforces the real constraint.
      "server-only": path.resolve(__dirname, "tests/support/server-only-stub.ts"),
    },
  },
});

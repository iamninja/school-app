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
    // services being up.
    exclude: [...defaultExclude, "tests/rls/**"],
    // isolate: false lets files sharing a worker reuse the same jsdom
    // environment and module graph (React/Radix/KaTeX etc.) instead of
    // reinitializing per file - measured as the dominant cost over actual
    // test execution. maxWorkers is capped below the CPU count so more
    // files land in each worker and there's more to actually reuse; above
    // ~4 workers for this suite's size, most workers only get 1-2 files and
    // the sharing benefit disappears. Re-tune both if the suite grows a lot.
    isolate: false,
    pool: "threads",
    maxWorkers: 4,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});

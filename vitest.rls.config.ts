import path from "path";
import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";

// RLS integration tests (tests/rls/**) - real HTTP calls to a local
// Supabase stack (`supabase start`), not jsdom-rendered components, so
// they get their own config: node environment, no setupFiles/react
// plugin, and only ever matches tests/rls/** (the default vitest.config.ts
// explicitly excludes this folder). Run via `npm run test:rls`, never
// part of the default `npm test`.
export default defineConfig(({ mode }) => {
  // Vite only auto-loads .env files into import.meta.env, not
  // process.env - tests/rls/helpers.ts reads plain process.env (matching
  // this repo's Next.js convention elsewhere), so load .env.local
  // manually. loadEnv also picks up plain .env if present.
  Object.assign(process.env, loadEnv(mode, process.cwd(), ""));

  return {
    test: {
      globals: true,
      environment: "node",
      include: ["tests/rls/**/*.test.ts"],
      testTimeout: 30000,
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "."),
      },
    },
  };
});

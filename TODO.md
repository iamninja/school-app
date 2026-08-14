# Modus — Punch List

Last reviewed: 2026-08-14 (post 1-2 month gap re-orientation)

## Bugs (fix first)

- [x] Fix syntax error / missing `classIds` declaration in `app/auth/parent/actions.ts` (~line 230-283). Project currently fails `tsc --noEmit` and would crash on every parent dashboard load. — Fixed 2026-08-14; also unmasked and fixed 12 downstream `ActionResult` narrowing errors across parent/student login/signup forms and diagnostic.ts files that TS couldn't previously reach.
- [x] Add test coverage for the parent flow (login, signup, dashboard) — this bug shipped specifically because parent has no tests while student/teacher do. — Done 2026-08-14: added `tests/parent-login.test.tsx` (9), `tests/parent-signup.test.tsx` (9), `tests/parent-dashboard.test.tsx` (7). Also found and fixed a nested `<button>`-inside-`<button>` bug in `parent-signup-form.tsx` (the diagnose button and its result panel were inside the submit button — invalid HTML, would have caused the diagnose click to also submit the form) while writing tests for that form.
- [x] Investigate flaky timeout in `tests/teacher-dashboard.student-form.test.tsx` ("does not submit without first name"). — Done 2026-08-14: root cause was Vitest's default 5000ms per-test timeout being too thin for tests that type into 6+ form fields via `user.type()` on a large component (observed durations up to 5030ms, right at the boundary). Raised `testTimeout` to 15000ms in `vitest.config.ts`. Verified with 3 repeated runs of the file (16/16 passing each time) plus a full suite run (66/66).
- [x] Run `npm audit fix` for vitest/vite/ws dev-dependency advisories (dev-only blast radius, but the vitest one is critical-rated and the fix is trivial). — Done 2026-08-14: `npm audit` now reports 0 vulnerabilities (vitest 4.0.18→4.1.10, vite 7.0.x→7.3.6, transitively fixing ws too). Only `package-lock.json` changed — no `package.json` range bumps needed. Verified with `tsc --noEmit` (clean) and full test suite (66/66 passing).
- [ ] Fix ESLint config scope — `npx eslint .` returns 15,765 problems, almost certainly linting `node_modules`/`.next` instead of just the project source. Needs an `ignores` entry in `eslint.config.mjs`.

## Missing core features

- [ ] Pin the floating `"latest"` dependencies (`next`, `@supabase/ssr`, `@supabase/supabase-js`) to explicit versions; align `eslint-config-next` to actual Next major (16.x). Do this before adding more code.
- [ ] Restore real database-level access control for parent data (RLS via a non-recursive helper function) instead of relying solely on app-layer `user_id` checks.
- [ ] Give teachers a dedicated, branded auth flow instead of the generic starter `/auth/login` — currently the only role without one.
- [ ] Strip remaining scaffold branding (README, nav "Next.js Supabase Starter" text, `shadcn-demo.tsx`, tutorial components) so the app reads as "Modus" everywhere.
- [ ] Decide the multi-teacher/organization data model question before building billing on top of today's `teacher_id`-scoped ownership.
- [ ] Password reset flow for student/parent accounts.
- [ ] Design + build myDATA/AADE invoice transmission as a durable background job (queue table with status/retry, not fire-and-forget from the request path).
- [ ] Design + build Viva Wallet billing flow (myDATA fiscalisation API) and Piraeus Bank reconciliation.

## Nice-to-haves

- [ ] Resolve legal business form (ατομική επιχείρηση vs ΙΚΕ) — affects invoice schema (VAT numbers, entity type). Still unresolved as of this review.
- [ ] Shared auth-action factory to de-duplicate the three near-identical role flows (teacher/student/parent `checkXEmail`/`signUpX`/`signInX`).
- [ ] Soft-delete/withdrawal state for student enrollment history.

---
*See full re-orientation assessment from 2026-08-14 conversation for context behind each item.*

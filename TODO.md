# Modus — Punch List

Last reviewed: 2026-08-14 (post 1-2 month gap re-orientation)

## Bugs (fix first)

- [ ] Fix syntax error / missing `classIds` declaration in `app/auth/parent/actions.ts` (~line 230-283). Project currently fails `tsc --noEmit` and would crash on every parent dashboard load.
- [ ] Add test coverage for the parent flow (login, signup, dashboard) — this bug shipped specifically because parent has no tests while student/teacher do.
- [ ] Investigate flaky timeout in `tests/teacher-dashboard.student-form.test.tsx` ("does not submit without first name").
- [ ] Run `npm audit fix` for vitest/vite/ws dev-dependency advisories (dev-only blast radius, but the vitest one is critical-rated and the fix is trivial).

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

# RLS integration tests

These exercise real Postgres row-level-security policies against a local
Supabase stack — every other test in this repo mocks the Supabase client
and never touches RLS at all. Not part of `npm test`/CI: they need Docker
and a running local stack, so they're run manually.

## Running

```bash
npx supabase start          # first time: pulls images, boots Postgres/Auth/PostgREST
npx supabase status          # prints the local URL + anon/service-role keys
```

Fill in `LOCAL_SUPABASE_URL`/`LOCAL_SUPABASE_ANON_KEY`/`LOCAL_SUPABASE_SERVICE_ROLE_KEY`
in `.env.local` from that output (already scaffolded there with comments) —
`vitest.rls.config.ts` loads it automatically, no manual `export` needed.
These are fixed local-dev values, not real secrets.

```bash
npm run test:rls
```

Separately, `npm run test:seed` runs `local-stack-reset.test.ts` — a
smoke test that `npx supabase db reset` completes cleanly (regression
check for the `seed.sql` `auth.users` FK bug found 2026-08-15). It's
**destructive** (wipes and replays whatever's currently in your local
stack) and slow, so it's not part of `test:rls`'s routine iteration loop
— run it deliberately, not as a matter of course.

## What's covered

`parent-family-isolation.test.ts` — a handful of the highest-traffic
policies, not exhaustive coverage of every policy in the schema:
- A parent can see their own child, not another family's.
- A parent can see the *other* parent in their own family (`family_parents`).
- A parent can see quiz questions for their child's assigned quiz, not an
  unrelated family's.
- A teacher can't see another teacher's student.

`local-stack-reset.test.ts` — `supabase db reset` (migrations + seed)
succeeds without a foreign-key violation.

## Adding a case

`fixtures.ts` creates two teachers, each with a family/student/class;
family A additionally has a second parent and a quiz. Reuse those fixtures
where the case fits rather than growing a new set for every test — extend
`fixtures.ts` only when an existing shape genuinely can't cover the new
policy.

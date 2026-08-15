# Supabase schema workflow

This project uses the Supabase CLI's tracked-migration workflow. The database
schema's source of truth is the linked Supabase project itself, mirrored here
as tracked migration files — not the other way around.

## Making a schema change

```bash
npm run db:migration -- <short-description>   # creates supabase/migrations/<timestamp>_<description>.sql
# edit the generated file
npm run db:push                                # applies pending migrations to the linked project
```

Never hand-paste SQL into the Supabase dashboard's SQL editor anymore — that
was the old workflow (see `history/` below) and it left no record of what had
actually been applied.

## Bootstrapping a new project (e.g. the real production database at launch)

```bash
npx supabase link --project-ref <new-project-ref>
npm run db:push
```

This replays every tracked migration (starting from the baseline) against
the new project in one step — no manual file-juggling, no risk of skipping
a step or running a dev-only script by accident.

## Folder guide

- **`migrations/`** — the live, CLI-tracked history. Generated/edited via
  `db:migration`/`db:push` above. This is what gets applied to any project.
- **`history/`** — the original hand-applied `.sql` files from before this
  workflow existed (`teacher-dashboard.sql`, `families.sql`, etc.). Superseded
  by the baseline migration and never re-applied, but kept for reference —
  their comments carry real design context (e.g. why `parent-rls.sql` uses
  `SECURITY DEFINER` helper functions instead of direct RLS policies).
- **`diagnostics/`** — manual, read-only scripts a human runs directly in the
  SQL editor to check RLS/policy state. Not migrations, not auto-applied.
- **`seed.sql`** — fake dev data (test students/parents/classes) plus a
  working local dev teacher login (`dev-teacher@example.test` /
  `local-dev-password`). Auto-runs on `supabase db reset` for local dev
  (`[db.seed] enabled = true`) — bootstraps its own `auth.users`/
  `auth.identities` row for the default placeholder teacher UUID, so it
  works out of the box against a fresh reset. Protected by
  `tests/rls/local-stack-reset.test.ts` (`npm run test:seed`).

## Local development / RLS integration tests

`supabase start` runs a full local stack (Postgres, Auth, PostgREST) via
Docker, separate from the linked remote project — used by `tests/rls/`
(see `tests/rls/README.md`) to exercise real RLS policies instead of
mocking them. Not part of `npm test`.

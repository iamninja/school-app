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

**Never use a Supabase MCP tool (`apply_migration`, `execute_sql`, or similar)
to change schema either** — same problem in a different shape. Each MCP call
stamps the migration ledger with its own call-time version, which doesn't
match the tracked migration file's timestamp even when the SQL is identical.
This has silently drifted the ledger on `school-app-dev` twice already
(2026-08-28 and 2026-09-11) and on `school-app` (production) once so far
(found 2026-09-11, not yet repaired — see the "custom lesson times" and
"migration drift" project memories). It doesn't corrupt data — `db:push`
safely refuses to run rather than guess — but every drifted entry costs a
manual diagnose-and-repair pass, and it's easy to not notice until the next
unrelated migration's `db:push` fails. If you need to inspect the database
from an MCP-connected session, read-only queries (`execute_sql` with a
`select`) are fine; any DDL goes through `db:migration` + `db:push`, always.

**If drift is found anyway:** for each remote-only version, find its `name`
in `schema_migrations` and match it to a local file with the same slug (they
share a name even though the timestamp differs), spot-check that the local
file's content is actually already live (e.g. the table/column it creates
exists), then run two repairs: the remote-only versions → `reverted`, the
matching local versions → `applied`. This only rewrites the
`supabase_migrations.schema_migrations` bookkeeping table, never touches
actual tables/columns/data — but confirm with whoever owns the project
before running it, since it's still a live-system, shared-state operation on
a project you may not control.

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

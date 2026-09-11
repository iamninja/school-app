@AGENTS.md

# Supabase schema changes

Never use a Supabase MCP tool (`apply_migration`, `execute_sql`, or similar) to
change schema — add/alter/drop anything — on `school-app` or `school-app-dev`.
Always create a tracked migration file (`npm run db:migration`) and apply it
with `npm run db:push`. See `supabase/README.md` for why and for the repair
procedure if drift is ever found.

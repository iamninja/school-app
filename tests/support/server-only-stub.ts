// Vitest doesn't implement Next.js's RSC client/server boundary transform,
// where a "use server" module imported by a client component is replaced
// with an RPC stub. Without that, rendering TeacherDashboard in jsdom
// imports the real action module and everything it imports, including
// lib/integrations/credentials -> "server-only", which throws by design.
//
// Aliasing server-only to this no-op keeps the guarantee where it matters
// (next build still enforces it - a client component importing a
// server-only module is a build error) while letting component tests
// render. Deliberately not a global mock of the actions themselves: those
// stay real so the export-surface guard test still sees the true module.
export {};

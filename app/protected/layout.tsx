// The teacher console owns its full-viewport chrome (sidebar, topbar,
// theme scope) inside components/teacher-dashboard.tsx, so this layout is a
// deliberate pass-through: no centered container, no marketing nav/footer.
export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="min-h-svh bg-background">{children}</div>;
}

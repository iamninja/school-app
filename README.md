# Modus

A management app for a tutoring center — classes, schedules, attendance, and quizzes, with separate portals for teachers, students, and parents.

## Stack

- [Next.js](https://nextjs.org) (App Router)
- [Supabase](https://supabase.com) for auth, database, and row-level security
- [Tailwind CSS](https://tailwindcss.com) and [shadcn/ui](https://ui.shadcn.com/) for styling and components
- [KaTeX](https://katex.org/) for rendering math notation in quizzes
- [Vitest](https://vitest.dev/) and [Testing Library](https://testing-library.com/) for tests

## Local development

1. Create a `.env.local` file (see `.env.example`) with your Supabase project's URL, publishable key, and service role key.
2. Link the Supabase CLI to your project and push the tracked migrations (see `supabase/README.md` for the full schema workflow):

   ```bash
   npx supabase link --project-ref <your-project-ref>
   npm run db:push
   ```

3. Install dependencies and start the dev server:

   ```bash
   npm install
   npm run dev
   ```

   The app runs on [localhost:3000](http://localhost:3000/).

## Other commands

```bash
npm run lint    # eslint
npm test        # vitest
npm run build   # production build
```

## Roles

- **Teacher** (`/protected/teacher`) — the only teacher account is created directly via the Supabase dashboard, not through the app.
- **Student** (`/student-dashboard`) — students sign up themselves once a teacher has added their record.
- **Parent** (`/parent-dashboard`) — parents sign up themselves once linked to a student record.

See `TODO.md` for the current state of the project and what's planned next.

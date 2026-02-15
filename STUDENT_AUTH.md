# Student Authentication System

This implementation adds a complete student self-registration and authentication system to the school app.

## Overview

Students can now create their own accounts and login to view a personalized dashboard. The system includes the following features:

### Prerequisites

**Required Environment Variable:**

Add the following to your `.env.local` file:

```env
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
```

Get this key from: Supabase Dashboard → Project Settings → API → `service_role` key (secret)

⚠️ **Security Warning**: This key bypasses Row Level Security. Never expose it to the browser or commit it to version control.

### Key Features

1. **Email Verification** - Students can only register if their email was previously added by a teacher
2. **One Account Per Student** - Each student email can only be used to create one account
3. **Secure Authentication** - Uses Supabase Auth for secure password management
4. **Read-Only Dashboard** - Students can view their information but cannot edit it
5. **Landing Page Integration** - "Login as Student" button on the homepage

## Database Changes

### SQL Migration

Run the migration file `supabase/student-auth.sql` to add the necessary schema changes:

```sql
-- Adds user_id column to students table
-- Creates unique indexes for user_id and email
-- Adds RLS policies for student data access
```

Key changes:

- `students.user_id` - Links student records to auth.users
- Unique constraint on `user_id` (one account per student)
- Unique constraint on `email` (prevents duplicate emails)
- RLS policies allowing students to view their own data (read-only)

## File Structure

### Server Actions

- `app/auth/student/actions.ts` - Server-side authentication logic
  - `checkStudentEmailAction()` - Validates email exists in students table
  - `signUpStudentAction()` - Creates auth user and links to student record
  - `signInStudentAction()` - Authenticates student and redirects to dashboard
  - `getStudentDashboardDataAction()` - Fetches student data for dashboard

### Components

- `components/student-signup-form.tsx` - Two-step signup form with email verification
- `components/student-login-form.tsx` - Standard login form for students
- `components/student-dashboard.tsx` - Student dashboard showing classes, schedule, attendance

### Pages

- `app/auth/student-signup/page.tsx` - Student registration page
- `app/auth/student-login/page.tsx` - Student login page
- `app/student-dashboard/page.tsx` - Student dashboard (protected)
- `app/page.tsx` - Updated landing page with "Login as Student" button

### Tests

- `tests/student-signup.test.tsx` - 9 tests for signup flow
- `tests/student-login.test.tsx` - 7 tests for login flow

Total: 16 passing tests

## User Flow

### For Teachers

1. Teacher creates a student in the teacher dashboard
2. Teacher must provide the student's email address
3. Student email is stored in the database but not linked to any auth user yet

### For Students

#### Sign Up Flow

1. Student clicks "Login as Student" on the landing page
2. On the signup page, student enters their email
3. Student clicks "Verify" button
4. System checks:
   - Does this email exist in the students table? ❌ → Show error message
   - Is this email already linked to a user account? ❌ → Show "already registered" error
   - Both checks pass ✅ → Show success message with student name
5. Student creates a password (minimum 6 characters)
6. Student confirms password (must match)
7. Student clicks "Create Account"
8. System creates auth user and links it to the student record
9. Student is redirected to login page with success message

#### Login Flow

1. Student enters email and password
2. System authenticates credentials
3. System verifies the user is linked to a student record
4. If valid: redirect to student dashboard
5. If invalid: show error message

## Student Dashboard

The dashboard displays:

### Personal Information Card

- Full name
- Grade level
- Email
- Tuition status (with color-coded badges)
- Parent/guardian contact information

### My Classes Card

- List of enrolled classes
- Hours per week for each class
- Class schedule (days and times)

### Attendance Overview Card

- Attendance rate percentage
- Present/Late/Absent counts
- Recent attendance records (last 10)
- Color-coded status badges

## Security Features

### Row Level Security (RLS)

Students have read-only access to:

- Their own student record (`students` table)
- Their parent information (`student_parents` table)
- Their class assignments (`student_class_assignments` table)
- Classes they're enrolled in (`classes` table)
- Schedule for their classes (`class_schedule_slots` table)
- Their own attendance records (`attendance_records` table)

Students **cannot**:

- View other students' data
- Modify any data (all policies are SELECT only)
- Create new records
- Delete records

### Authentication Checks

1. Email verification before signup prevents random users from registering
2. Duplicate email check prevents account hijacking
3. User-to-student linkage verification on login ensures only students access the dashboard
4. Server-side validation on all actions

## Testing

Run tests with:

```bash
npm test -- --run student-signup student-login
```

### Test Coverage

**Student Signup (9 tests)**

- ✓ Email verification required before password fields
- ✓ Error when email not in students table
- ✓ Error when email already registered
- ✓ Password fields shown after verification
- ✓ Password matching validation
- ✓ Minimum password length validation
- ✓ Successful account creation
- ✓ Email field disabled after verification
- ✓ Verification message shows student name

**Student Login (7 tests)**

- ✓ Form renders with required fields
- ✓ Link to signup page
- ✓ Email required validation
- ✓ Password required validation
- ✓ Successful login submission
- ✓ Error message on failed login
- ✓ Loading state during authentication

## API Reference

### checkStudentEmailAction(email: string)

Checks if an email exists in the students table and is not already registered.

**Returns:**

```typescript
{
  exists: boolean;
  studentId?: string;
  firstName?: string;
  lastName?: string;
  error?: string;
}
```

### signUpStudentAction({ email, password })

Creates a new auth user and links it to the existing student record.

**Returns:**

```typescript
{
  success?: boolean;
  error?: string;
}
```

### signInStudentAction({ email, password })

Authenticates a student and redirects to dashboard on success.

**Returns:**

```typescript
{
  error?: string;
}
// Or redirects to /student-dashboard if successful
```

### getStudentDashboardDataAction()

Fetches all data needed for the student dashboard.

**Returns:**

```typescript
{
  student: { ... };
  parents: [ ... ];
  classes: [ ... ];
  schedules: [ ... ];
  attendance: [ ... ];
}
// Or redirects to /auth/student-login if not authenticated
```

## Future Enhancements

Potential additions (not yet implemented):

1. **Password Reset** - Allow students to reset forgotten passwords
2. **Profile Picture** - Add avatar upload for students
3. **Notifications** - Email/push notifications for attendance or assignments
4. **Assignment Submission** - Allow students to submit homework
5. **Gradebook** - Show grades and progress reports
6. **Calendar View** - Visual calendar showing class schedule
7. **Parent Portal** - Separate login for parents to view student info
8. **Two-Factor Authentication** - Enhanced security option
9. **Mobile App** - React Native app using the same backend

## Troubleshooting

### "No student found with this email"

- The teacher hasn't created your student record yet
- The email you entered doesn't match what the teacher entered
- Contact your teacher to verify your email is in the system

### "This email is already registered"

- You already have an account
- Use the login page instead of signup
- If you forgot your password, use the password reset feature (to be implemented)

### "This account is not registered as a student"

- You logged in with a teacher or admin account
- Use the correct login page for your role
- Students should use `/auth/student-login`
- Teachers should use `/auth/login`

### Can't see my classes/attendance

- Check with your teacher that you've been assigned to classes
- RLS policies might need to be reapplied (check database)
- Try logging out and back in

## Migration Checklist

To deploy this feature to production:

- [ ] Add `SUPABASE_SERVICE_ROLE_KEY` environment variable
  - Get this from your Supabase project settings → API
  - This key bypasses RLS and is used for email verification during signup
  - **IMPORTANT**: Keep this secret and never expose it to the browser
- [ ] Run `supabase/student-auth.sql` migration
- [ ] Verify RLS policies are active (`SELECT * FROM pg_policies`)
- [ ] Test with a real student record
- [ ] Ensure email uniqueness in existing data
- [ ] Update any existing student records with NULL emails to unique values
- [ ] Deploy frontend changes
- [ ] Test full signup → login → dashboard flow
- [ ] Monitor error logs for auth-related issues

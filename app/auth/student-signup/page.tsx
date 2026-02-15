import { StudentSignUpForm } from "@/components/student-signup-form";

export default function StudentSignUpPage() {
  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <StudentSignUpForm />
      </div>
    </div>
  );
}

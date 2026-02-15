import { StudentLoginForm } from "@/components/student-login-form";

export default function StudentLoginPage() {
  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <StudentLoginForm />
      </div>
    </div>
  );
}

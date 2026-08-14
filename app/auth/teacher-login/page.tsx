import { TeacherLoginForm } from "@/components/teacher-login-form";

export default function TeacherLoginPage() {
  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <TeacherLoginForm />
      </div>
    </div>
  );
}

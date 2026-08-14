import { ParentSignUpForm } from "@/components/parent-signup-form";

export default function ParentSignUpPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-3xl font-bold">Parent Sign Up</h1>
          <p className="text-muted-foreground">
            Create your account using the email provided by your child&apos;s teacher
          </p>
        </div>
        <ParentSignUpForm />
      </div>
    </div>
  );
}

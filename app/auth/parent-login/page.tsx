import { ParentLoginForm } from "@/components/parent-login-form";

export default function ParentLoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-3xl font-bold">Parent Login</h1>
          <p className="text-muted-foreground">
            Sign in to view your child's information
          </p>
        </div>
        <ParentLoginForm />
      </div>
    </div>
  );
}

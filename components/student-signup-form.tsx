"use client";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  checkStudentEmailAction,
  signUpStudentAction,
} from "@/app/auth/student/actions";
import {
  diagnosticCheckAction,
  type DiagnosticResult,
} from "@/app/auth/student/diagnostic";

export function StudentSignUpForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingEmail, setIsCheckingEmail] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);
  const [studentName, setStudentName] = useState("");
  const [diagnosticInfo, setDiagnosticInfo] = useState<DiagnosticResult | null>(
    null,
  );
  const router = useRouter();

  const handleCheckEmail = async () => {
    if (!email) {
      setError("Please enter your email");
      return;
    }

    setIsCheckingEmail(true);
    setError(null);

    try {
      console.log("Checking email:", email);
      const result = await checkStudentEmailAction(email);
      console.log("Email check result:", result);

      if (result.exists) {
        setEmailVerified(true);
        setStudentName(`${result.firstName} ${result.lastName}`);
        setError(null);
      } else {
        setError(result.error || "Unable to verify email");
        setEmailVerified(false);
      }
    } catch (error: unknown) {
      console.error("Email check error:", error);
      setError(error instanceof Error ? error.message : "An error occurred");
      setEmailVerified(false);
    } finally {
      setIsCheckingEmail(false);
    }
  };

  const handleDiagnostic = async () => {
    const result = await diagnosticCheckAction();
    console.log("Diagnostic result:", result);
    setDiagnosticInfo(result);
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      setIsLoading(false);
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      setIsLoading(false);
      return;
    }

    try {
      const result = await signUpStudentAction({ email, password });
      if (!result.success && result.error) {
        setError(result.error);
      } else {
        router.push("/auth/student-login?registered=true");
      }
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Student Sign Up</CardTitle>
          <CardDescription>
            Create your student account using the email your teacher provided
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSignUp}>
            <div className="flex flex-col gap-6">
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <div className="flex gap-2">
                  <Input
                    id="email"
                    type="email"
                    placeholder="student@example.com"
                    required
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setEmailVerified(false);
                      setStudentName("");
                    }}
                    disabled={emailVerified}
                  />
                  {!emailVerified && (
                    <Button
                      type="button"
                      onClick={handleCheckEmail}
                      disabled={isCheckingEmail}
                    >
                      {isCheckingEmail ? "Checking..." : "Verify"}
                    </Button>
                  )}
                </div>
                {emailVerified && studentName && (
                  <p className="text-sm text-green-600">
                    ✓ Verified as {studentName}
                  </p>
                )}
              </div>

              {emailVerified && (
                <>
                  <div className="grid gap-2">
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      placeholder="Create a password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      minLength={6}
                    />
                    <p className="text-xs text-muted-foreground">
                      Must be at least 6 characters
                    </p>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="confirmPassword">Confirm Password</Label>
                    <Input
                      id="confirmPassword"
                      type="password"
                      placeholder="Confirm your password"
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      minLength={6}
                    />
                  </div>
                </>
              )}

              {error && <p className="text-sm text-red-500">{error}</p>}

              {emailVerified && (
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? "Creating account..." : "Create Account"}
                </Button>
              )}

              {/* Diagnostic section - remove after debugging */}
              <div className="border-t pt-4">
                <Button
                  type="button"
                  onClick={handleDiagnostic}
                  variant="outline"
                  className="w-full"
                >
                  Debug: Check Database
                </Button>
                {diagnosticInfo && (
                  <div className="mt-2 p-3 bg-muted rounded text-xs font-mono overflow-auto max-h-48">
                    <pre>{JSON.stringify(diagnosticInfo, null, 2)}</pre>
                  </div>
                )}
              </div>
            </div>
            <div className="mt-4 text-center text-sm">
              Already have an account?{" "}
              <Link
                href="/auth/student-login"
                className="underline underline-offset-4"
              >
                Login
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

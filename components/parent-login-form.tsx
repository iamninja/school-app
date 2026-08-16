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
import { useState } from "react";
import { signInParentAction } from "@/app/auth/parent/actions";
import {
  diagnoseParentAccountAction,
  type DiagnosticResult,
} from "@/app/auth/parent/diagnostic";
import { useSearchParams } from "next/navigation";

export function ParentLoginForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [diagnosing, setDiagnosing] = useState(false);
  const [diagnostic, setDiagnostic] = useState<DiagnosticResult | null>(null);
  const searchParams = useSearchParams();
  const registered = searchParams.get("registered");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setDiagnostic(null);

    try {
      const result = await signInParentAction({ email, password });
      if (result && !result.success && result.error) {
        setError(result.error);
      }
    } catch (error: unknown) {
      setError(
        error instanceof Error ? error.message : "Παρουσιάστηκε σφάλμα",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleDiagnose = async () => {
    if (!email) {
      setError("Παρακαλώ εισάγετε ένα email για διάγνωση");
      return;
    }

    setDiagnosing(true);
    setError(null);
    const result = await diagnoseParentAccountAction(email);
    setDiagnostic(result);
    setDiagnosing(false);
  };

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Σύνδεση γονέα</CardTitle>
          <CardDescription>
            Εισάγετε το email και τον κωδικό σας για να δείτε τα στοιχεία του
            παιδιού σας
          </CardDescription>
        </CardHeader>
        <CardContent>
          {registered && (
            <div className="mb-4 rounded-md bg-green-50 p-3 text-sm text-green-700">
              Ο λογαριασμός δημιουργήθηκε! Συνδεθείτε για να συνεχίσετε.
            </div>
          )}
          <form onSubmit={handleLogin}>
            <div className="flex flex-col gap-6">
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="parent@example.com"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <div className="flex items-center">
                  <Label htmlFor="password">Κωδικός</Label>
                  <Link
                    href="/auth/forgot-password"
                    className="ml-auto inline-block text-sm underline-offset-4 hover:underline"
                  >
                    Ξεχάσατε τον κωδικό σας;
                  </Link>
                </div>
                <Input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              {error && <p className="text-sm text-red-500">{error}</p>}

              <div className="mt-6 border-t pt-6">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={handleDiagnose}
                  disabled={diagnosing}
                >
                  {diagnosing
                    ? "Γίνεται διάγνωση..."
                    : "🔍 Διάγνωση προβλήματος λογαριασμού"}
                </Button>
                {diagnostic && (
                  <div className="mt-4 p-4 rounded-lg border bg-muted/50 space-y-2">
                    <p className="font-semibold">
                      Κατάσταση:{" "}
                      {diagnostic.status === "valid" && "✅ Έγκυρος"}
                      {diagnostic.status === "not_found" && "❌ Δεν βρέθηκε"}
                      {diagnostic.status === "not_registered" &&
                        "⚠️ Μη εγγεγραμμένος"}
                      {diagnostic.status === "orphaned" &&
                        "❌ Μη έγκυρη κατάσταση"}
                      {diagnostic.status === "mismatch" &&
                        "⚠️ Ασυμφωνία email"}
                    </p>
                    <p className="text-sm">{diagnostic.message}</p>
                    {diagnostic.suggestion && (
                      <p className="text-sm font-medium text-primary">
                        → {diagnostic.suggestion}
                      </p>
                    )}
                  </div>
                )}
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? "Σύνδεση..." : "Σύνδεση"}
              </Button>
            </div>
            <div className="mt-4 text-center text-sm">
              Δεν έχετε λογαριασμό;{" "}
              <Link
                href="/auth/parent-signup"
                className="underline underline-offset-4"
              >
                Εγγραφή
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

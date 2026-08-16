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
  checkParentEmailAction,
  signUpParentAction,
} from "@/app/auth/parent/actions";
import {
  diagnoseParentAccountAction,
  type DiagnosticResult,
} from "@/app/auth/parent/diagnostic";

export function ParentSignUpForm({
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
  const [parentName, setParentName] = useState("");
  const [diagnosing, setDiagnosing] = useState(false);
  const [diagnostic, setDiagnostic] = useState<DiagnosticResult | null>(null);
  const router = useRouter();

  const handleCheckEmail = async () => {
    if (!email) {
      setError("Παρακαλώ εισάγετε το email σας");
      return;
    }

    setIsCheckingEmail(true);
    setError(null);
    setDiagnostic(null);

    try {
      const result = await checkParentEmailAction(email);
      if (result.exists) {
        setEmailVerified(true);
        setParentName(result.parentName || "");
        setError(null);
      } else {
        setError(result.error || "Δεν ήταν δυνατή η επαλήθευση του email");
        setEmailVerified(false);
      }
    } catch (error: unknown) {
      setError(
        error instanceof Error ? error.message : "Παρουσιάστηκε σφάλμα",
      );
      setEmailVerified(false);
    } finally {
      setIsCheckingEmail(false);
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

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    if (password !== confirmPassword) {
      setError("Οι κωδικοί δεν ταιριάζουν");
      setIsLoading(false);
      return;
    }

    if (password.length < 6) {
      setError("Ο κωδικός πρέπει να έχει τουλάχιστον 6 χαρακτήρες");
      setIsLoading(false);
      return;
    }

    try {
      const result = await signUpParentAction({ email, password });
      if (!result.success && result.error) {
        setError(result.error);
      } else {
        router.push("/auth/parent-login?registered=true");
      }
    } catch (error: unknown) {
      setError(
        error instanceof Error ? error.message : "Παρουσιάστηκε σφάλμα",
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Εγγραφή γονέα</CardTitle>
          <CardDescription>
            Δημιουργήστε τον λογαριασμό γονέα με το email που δώσατε στον
            καθηγητή του παιδιού σας
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
                    placeholder="parent@example.com"
                    required
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setEmailVerified(false);
                      setParentName("");
                    }}
                    disabled={emailVerified}
                  />
                  {!emailVerified && (
                    <Button
                      type="button"
                      onClick={handleCheckEmail}
                      disabled={isCheckingEmail}
                    >
                      {isCheckingEmail ? "Έλεγχος..." : "Επαλήθευση"}
                    </Button>
                  )}
                </div>
                {emailVerified && parentName && (
                  <p className="text-sm text-green-600">
                    ✓ Επαληθεύτηκε ως {parentName}
                  </p>
                )}
              </div>

              {emailVerified && (
                <>
                  <div className="grid gap-2">
                    <Label htmlFor="password">Κωδικός</Label>
                    <Input
                      id="password"
                      type="password"
                      placeholder="Δημιουργήστε έναν κωδικό"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      minLength={6}
                    />
                    <p className="text-xs text-muted-foreground">
                      Πρέπει να έχει τουλάχιστον 6 χαρακτήρες
                    </p>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="confirmPassword">
                      Επιβεβαίωση κωδικού
                    </Label>
                    <Input
                      id="confirmPassword"
                      type="password"
                      placeholder="Επιβεβαιώστε τον κωδικό σας"
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
                <>
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
                    {isLoading ? "Δημιουργία λογαριασμού..." : "Δημιουργία λογαριασμού"}
                  </Button>
                </>
              )}
            </div>
            <div className="mt-4 text-center text-sm">
              Έχετε ήδη λογαριασμό;{" "}
              <Link
                href="/auth/parent-login"
                className="underline underline-offset-4"
              >
                Σύνδεση
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

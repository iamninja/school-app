import Link from "next/link";
import { Button } from "./ui/button";
import { createClient } from "@/lib/supabase/server";
import { LogoutButton } from "./logout-button";

const LABELS = {
  en: { greeting: "Hey,", signIn: "Sign in" },
  el: { greeting: "Γεια σου,", signIn: "Σύνδεση" },
};

export async function AuthButton({
  locale = "en",
}: {
  locale?: "en" | "el";
}) {
  const supabase = await createClient();

  // You can also use getUser() which will be slower.
  const { data } = await supabase.auth.getClaims();

  const user = data?.claims;
  const labels = LABELS[locale];

  return user ? (
    <div className="flex items-center gap-4">
      {labels.greeting} {user.email}!
      <LogoutButton locale={locale} />
    </div>
  ) : (
    <Button asChild size="sm" variant={"outline"}>
      <Link href="/auth/teacher-login">{labels.signIn}</Link>
    </Button>
  );
}

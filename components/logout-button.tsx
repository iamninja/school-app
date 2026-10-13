"use client";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { forgetPushDeviceBeforeSignOut } from "@/components/use-push-device";

const LABELS = { en: "Logout", el: "Αποσύνδεση" };

export function LogoutButton({
  locale = "en",
}: {
  locale?: "en" | "el";
}) {
  const router = useRouter();

  const logout = async () => {
    await forgetPushDeviceBeforeSignOut();
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/auth/teacher-login");
  };

  return <Button onClick={logout}>{LABELS[locale]}</Button>;
}

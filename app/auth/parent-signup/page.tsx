import { ParentSignUpForm } from "@/components/parent-signup-form";

export default function ParentSignUpPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-3xl font-bold">Εγγραφή γονέα</h1>
          <p className="text-muted-foreground">
            Δημιουργήστε τον λογαριασμό σας με το email που δώσατε στον
            καθηγητή του παιδιού σας
          </p>
        </div>
        <ParentSignUpForm />
      </div>
    </div>
  );
}

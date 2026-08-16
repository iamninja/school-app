import { LogoutButton } from "./logout-button";

export function AuthButton() {
  return (
    <div className="flex items-center gap-4">
      Hey, Vagios!
      <LogoutButton />
    </div>
  );
}

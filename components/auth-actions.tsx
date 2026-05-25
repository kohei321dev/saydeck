import { LogIn, LogOut } from "lucide-react";
import type { Session } from "next-auth";

import { signIn, signOut } from "@/auth";

type AuthActionsProps = {
  devBypass?: boolean;
  session: Session | null;
};

export function AuthActions({ devBypass = false, session }: AuthActionsProps) {
  if (devBypass) {
    return <span className="auth-user">@uechikohei dev</span>;
  }

  if (!session?.user) {
    return (
      <form
        action={async () => {
          "use server";
          await signIn("github");
        }}
      >
        <button className="auth-button" type="submit">
          <LogIn aria-hidden="true" size={18} />
          GitHub login
        </button>
      </form>
    );
  }

  return (
    <div className="auth-state">
      <span className="auth-user">{session.user.githubLogin}</span>
      <form
        action={async () => {
          "use server";
          await signOut();
        }}
      >
        <button className="icon-button" type="submit" title="Sign out">
          <LogOut aria-hidden="true" size={18} />
        </button>
      </form>
    </div>
  );
}

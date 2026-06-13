"use client";

import { signIn, signOut } from "next-auth/react";
import { Github, LogOut } from "lucide-react";
import { useState } from "react";

type SignInButtonsProps = {
  allowGitHub: boolean;
  callbackUrl: string;
};

export function SignInButtons({
  allowGitHub,
  callbackUrl,
}: SignInButtonsProps) {
  const [isLoading, setIsLoading] = useState(false);

  return (
    <div className="auth-button-stack">
      {allowGitHub ? (
        <button
          className="primary-button"
          disabled={isLoading}
          onClick={() => {
            setIsLoading(true);
            void signIn("github", { callbackUrl });
          }}
        >
          <Github aria-hidden="true" size={18} />
          {isLoading ? "GitHubへ移動中" : "GitHubでログイン"}
        </button>
      ) : null}
    </div>
  );
}

export function SignOutButton() {
  return (
    <button className="icon-text-button" onClick={() => signOut({ callbackUrl: "/signin" })}>
      <LogOut aria-hidden="true" size={16} />
      ログアウト
    </button>
  );
}

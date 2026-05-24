"use client";

import { signIn, signOut } from "next-auth/react";
import { Github, LogOut } from "lucide-react";

export function SignInButton() {
  return (
    <button className="primary-button" onClick={() => signIn("github")}>
      <Github aria-hidden="true" size={18} />
      GitHubでログイン
    </button>
  );
}

export function SignOutButton() {
  return (
    <button className="icon-text-button" onClick={() => signOut()}>
      <LogOut aria-hidden="true" size={16} />
      ログアウト
    </button>
  );
}


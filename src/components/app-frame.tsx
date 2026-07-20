import Image from "next/image";
import Link from "next/link";

import { SignOutButton } from "@/components/sign-in-button";

type AppFrameProps = {
  activePath?: "practice" | "create" | "library" | "export";
  children: React.ReactNode;
  roleLabel?: string;
  userLabel?: string;
};

const navigation = [
  { href: "/", id: "practice", label: "学習" },
  { href: "/create", id: "create", label: "表現を作る" },
  { href: "/library", id: "library", label: "Library" },
  { href: "/export", id: "export", label: "Anki export" },
] as const;

/**
 * Shared authenticated application frame for the new expression routes.
 *
 * The legacy home page still owns its existing frame while migration is in
 * progress. New pages use this component so navigation and sign-out behavior
 * stay consistent without coupling their client state to ScenePractice.
 */
export function AppFrame({
  activePath,
  children,
  roleLabel,
  userLabel,
}: AppFrameProps) {
  return (
    <div className="app-frame">
      <header className="topbar">
        <div className="brand">
          <Image
            alt=""
            aria-hidden="true"
            className="brand-icon"
            height={28}
            src="/icon.svg"
            width={28}
          />
          <Link className="brand-link" href="/">
            <strong>SayDeck</strong>
          </Link>
        </div>
        <nav aria-label="SayDeck navigation" className="app-nav">
          {navigation.map((item) => (
            <Link
              aria-current={activePath === item.id ? "page" : undefined}
              className={activePath === item.id ? "app-nav-link active" : "app-nav-link"}
              href={item.href}
              key={item.id}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="topbar-actions">
          {userLabel ? (
            <span className="user-chip">
              @{userLabel} {roleLabel ?? "viewer"}
            </span>
          ) : null}
          <SignOutButton />
        </div>
      </header>
      {children}
    </div>
  );
}

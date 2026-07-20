import Image from "next/image";
import Link from "next/link";

import { SignOutButton } from "@/components/sign-in-button";

type AppFrameProps = {
  activePath?: "input" | "lists" | "export";
  children: React.ReactNode;
  roleLabel?: string;
  userLabel?: string;
};

const navigation = [
  { href: "/input", id: "input", label: "INPUT" },
  { href: "/lists", id: "lists", label: "LISTS" },
  { href: "/export", id: "export", label: "EXPORT" },
] as const;

/**
 * Shared authenticated frame for the expression-production workflow.
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
              @{userLabel} {roleLabel ?? "owner"}
            </span>
          ) : null}
          <SignOutButton />
        </div>
      </header>
      {children}
    </div>
  );
}

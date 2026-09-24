"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

export interface AccountEntryState {
  readonly label: "Sign In" | "Account";
  readonly href: "/account/login" | "/account";
  readonly active: boolean;
}

const SIGN_IN: AccountEntryState = {
  label: "Sign In",
  href: "/account/login",
  active: false,
};
const ACCOUNT: AccountEntryState = {
  label: "Account",
  href: "/account",
  active: false,
};

/**
 * Presentation-only auth-aware label for PlatformHeader (issue #21) - never a global auth
 * provider, this state lives only inside whichever client island calls the hook. Deterministic
 * routes (login/register, any other protected /account/* page) never need a network call; only a
 * public/ambiguous route asks /api/session-presence, and only to decide which label to show, not
 * whether a route may render (protected pages still resolve their own session server-side).
 */
export function useAccountEntry(): AccountEntryState {
  const pathname = usePathname();
  const deterministic = deterministicEntry(pathname);
  const [presenceSignedIn, setPresenceSignedIn] = useState(false);

  useEffect(() => {
    if (deterministic) {
      return;
    }
    let cancelled = false;
    fetch("/api/session-presence", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: unknown) => {
        if (!cancelled && isPresenceResponse(data)) {
          setPresenceSignedIn(data.signedIn);
        }
      })
      .catch(() => {
        // Presentation-only signal - a failed check just keeps the safe "Sign In" fallback.
      });
    return () => {
      cancelled = true;
    };
  }, [pathname, deterministic]);

  const entry = deterministic ?? (presenceSignedIn ? ACCOUNT : SIGN_IN);
  return { ...entry, active: isAccountPath(pathname) };
}

// "/account" itself or a real descendant only - a bare startsWith("/account") would also match an
// unrelated future route like "/accounts" or "/accountability".
function isAccountPath(pathname: string): boolean {
  return pathname === "/account" || pathname.startsWith("/account/");
}

function deterministicEntry(pathname: string): AccountEntryState | null {
  if (pathname === "/account/login" || pathname === "/account/register") {
    return SIGN_IN;
  }
  if (isAccountPath(pathname)) {
    return ACCOUNT;
  }
  return null;
}

function isPresenceResponse(value: unknown): value is { signedIn: boolean } {
  return (
    typeof value === "object" &&
    value !== null &&
    "signedIn" in value &&
    typeof (value as { signedIn: unknown }).signedIn === "boolean"
  );
}

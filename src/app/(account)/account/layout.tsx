import Link from "next/link";
import { Container, Stack } from "@mui/material";

// Account data is per-user and never safe to cache/prerender - see resolveCurrentAccountSession
// and transport.ts's cache: "no-store" on every Backend V2 call.
export const dynamic = "force-dynamic";

const SUB_NAV_LINKS = [
  { href: "/account", label: "Account" },
  { href: "/account/profile", label: "Profile" },
  { href: "/account/friends", label: "Friends" },
  { href: "/account/challenges", label: "Challenges" },
  { href: "/account/players", label: "Find Player" },
] as const;

export default function AccountLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <Container maxWidth="sm" sx={{ paddingY: { xs: 4, sm: 8 } }}>
      <Stack spacing={4}>
        <Stack
          component="nav"
          aria-label="Account"
          direction="row"
          spacing={{ xs: 2, sm: 3 }}
          // Five links at spacing=3 overflow a narrow (~390px) viewport by ~10px (issue #10's
          // responsive certification, e2e/responsive.spec.ts) - wrapping instead of scrolling
          // horizontally keeps every link reachable without introducing page-level overflow.
          sx={{ flexWrap: "wrap", rowGap: 1 }}
        >
          {SUB_NAV_LINKS.map((link) => (
            <Link key={link.href} href={link.href}>
              {link.label}
            </Link>
          ))}
        </Stack>
        {children}
      </Stack>
    </Container>
  );
}

"use client";

import { Box, Container, Stack, Typography } from "@mui/material";
import { usePathname } from "next/navigation";
import ButtonLink from "@/Components/ButtonLink";
import NextLinkAdapter from "@/Components/NextLinkAdapter";

export interface GameLocalNavItem {
  readonly label: string;
  readonly href: string;
}

export interface GameLocalNavProps {
  readonly gameLabel: string;
  readonly gameHref: string;
  readonly items: readonly GameLocalNavItem[];
  /** Small presentation override for a game's identity (issue #21's branding seam) - a future
   *  game section can pass its own accent color without GameLocalNav knowing anything about it. */
  readonly accentColor?: string;
}

// Reusable game-section navigation (issue #21) - deliberately narrow: identity + a flat list of
// local destinations + active-route semantics. Not a page-definition schema or route registry;
// callers own their own item lists (see level5/layout.tsx).
export default function GameLocalNav({
  gameLabel,
  gameHref,
  items,
  accentColor,
}: GameLocalNavProps) {
  const pathname = usePathname();
  const isGameHomeActive = pathname === gameHref;

  return (
    <Box
      component="nav"
      aria-label={`${gameLabel} navigation`}
      sx={{ borderBottom: 1, borderColor: accentColor ?? "divider" }}
    >
      <Container maxWidth="lg">
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={{ xs: 1, sm: 3 }}
          sx={{ alignItems: { sm: "center" }, paddingY: 2, flexWrap: "wrap" }}
        >
          <Typography
            component={NextLinkAdapter}
            href={gameHref}
            aria-current={isGameHomeActive ? "page" : undefined}
            variant="subtitle1"
            sx={{
              fontWeight: 700,
              textDecoration: "none",
              color: accentColor ?? "text.primary",
            }}
          >
            {gameLabel}
          </Typography>
          <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
            {items.map((item) => {
              const active = pathname === item.href;
              return (
                <ButtonLink
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  sx={{
                    fontWeight: active ? 700 : 500,
                    color: active
                      ? (accentColor ?? "primary.main")
                      : "text.primary",
                  }}
                >
                  {item.label}
                </ButtonLink>
              );
            })}
          </Stack>
        </Stack>
      </Container>
    </Box>
  );
}

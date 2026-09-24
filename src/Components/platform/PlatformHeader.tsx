"use client";

import { useState } from "react";
import {
  AppBar,
  Box,
  Container,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  Toolbar,
} from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import { usePathname } from "next/navigation";
import ButtonLink from "@/Components/ButtonLink";
import NextLinkAdapter from "@/Components/NextLinkAdapter";
import { PLATFORM_DESTINATIONS } from "@/lib/platform/destinations";
import { useAccountEntry } from "@/lib/platform/useAccountEntry";

const DRAWER_WIDTH = 260;

// Platform-global navigation only (issue #21) - Sweat This, Level 5 (and later Secret Robot), and
// the auth-aware Sign In/Account entry. Game-section concerns (Level 5's Scores/Characters/Dr
// Blood) live in GameLocalNav instead, rendered by each game's own layout.
export default function PlatformHeader() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const accountEntry = useAccountEntry();
  const closeMobile = () => setMobileOpen(false);

  const destinations = PLATFORM_DESTINATIONS.map((destination) => ({
    ...destination,
    active: destination.isActive(pathname),
  }));

  return (
    <AppBar
      position="static"
      color="default"
      elevation={0}
      sx={{ borderBottom: 1, borderColor: "divider" }}
    >
      <Container maxWidth="lg">
        <Toolbar disableGutters sx={{ gap: { xs: 1, md: 3 } }}>
          <IconButton
            aria-label="Open navigation menu"
            onClick={() => setMobileOpen(true)}
            sx={{ display: { xs: "inline-flex", md: "none" } }}
          >
            <MenuIcon />
          </IconButton>

          <Box
            component="nav"
            aria-label="Primary"
            sx={{
              display: { xs: "none", md: "flex" },
              alignItems: "center",
              gap: 1,
              flexGrow: 1,
            }}
          >
            {destinations.map((destination) => (
              <ButtonLink
                key={destination.href}
                href={destination.href}
                aria-current={destination.active ? "page" : undefined}
                sx={{ fontWeight: destination.active ? 700 : 500 }}
              >
                {destination.label}
              </ButtonLink>
            ))}
          </Box>

          <ButtonLink
            href={accountEntry.href}
            aria-current={accountEntry.active ? "page" : undefined}
            sx={{
              marginLeft: "auto",
              fontWeight: accountEntry.active ? 700 : 500,
            }}
          >
            {accountEntry.label}
          </ButtonLink>
        </Toolbar>
      </Container>

      <Drawer anchor="left" open={mobileOpen} onClose={closeMobile}>
        <Box sx={{ width: DRAWER_WIDTH }} role="presentation">
          <List component="nav" aria-label="Mobile">
            {destinations.map((destination) => (
              <ListItemButton
                key={destination.href}
                component={NextLinkAdapter}
                href={destination.href}
                selected={destination.active}
                aria-current={destination.active ? "page" : undefined}
                onClick={closeMobile}
              >
                <ListItemText primary={destination.label} />
              </ListItemButton>
            ))}
            <Divider />
            <ListItemButton
              component={NextLinkAdapter}
              href={accountEntry.href}
              selected={accountEntry.active}
              aria-current={accountEntry.active ? "page" : undefined}
              onClick={closeMobile}
            >
              <ListItemText primary={accountEntry.label} />
            </ListItemButton>
          </List>
        </Box>
      </Drawer>
    </AppBar>
  );
}

"use client";

import { useState } from "react";
import AppBar from "@mui/material/AppBar";
import Toolbar from "@mui/material/Toolbar";
import {
  Box,
  Chip,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  Stack,
  SxProps,
  Theme,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import ButtonLink from "./ButtonLink";
import NextLinkAdapter from "./NextLinkAdapter";
import useCurrentVersion from "../lib/backend-v1-public/hooks/useCurrentVersion";
import useServerHealth from "../lib/backend-v1-public/hooks/useServerHealth";

const style: SxProps<Theme> = {
  color: "text.primary",
  backgroundImage: "none",
  backgroundColor: "background.default",
  boxShadow: "none",
  position: "unset",
};

const navLinks = [
  { to: "/", label: "Title" },
  { to: "/level5", label: "Scores" },
  { to: "/level5/characters", label: "Characters" },
  { to: "/level5/drblood", label: "Dr Blood" },
  { to: "/account", label: "Account" },
];

function getStatusChipColor(isOffline: boolean): "error" | "success" {
  return isOffline ? "error" : "success";
}

function getServerStatusLabel(isOffline: boolean): "Offline" | "Online" {
  return isOffline ? "Offline" : "Online";
}

export default function MainNavBar() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const [drawerOpen, setDrawerOpen] = useState(false);

  const {
    data: currentVersion,
    isError: versionError,
    isPending: versionPending,
  } = useCurrentVersion();
  // Server status and current version are two different claims - a version-fetch error doesn't
  // mean the API is down, so this reads a dedicated health check instead of reusing useCurrentVersion's error state.
  const { data: isHealthy, isError: healthError } = useServerHealth();

  const versionLabel =
    currentVersion ?? (versionPending ? "Loading..." : "Unknown");
  const isOffline = healthError || isHealthy === false;

  const statusChips = (
    <Stack
      direction="row"
      spacing={1}
      sx={{ flexWrap: "wrap", alignItems: "center" }}
    >
      <Typography variant="body2">Version</Typography>
      <Chip
        size="small"
        label={versionLabel}
        color={getStatusChipColor(versionError)}
      />
      <Typography variant="body2">Server</Typography>
      <Chip
        size="small"
        label={getServerStatusLabel(isOffline)}
        color={getStatusChipColor(isOffline)}
      />
    </Stack>
  );

  const navButtons = navLinks.map((link) => (
    <ButtonLink
      key={link.to}
      href={link.to}
      sx={{ fontWeight: "bolder", fontSize: "1.1em" }}
    >
      {link.label}
    </ButtonLink>
  ));

  if (isMobile) {
    return (
      <AppBar sx={style}>
        <Toolbar sx={{ justifyContent: "space-between" }}>
          <IconButton
            aria-label="Open navigation menu"
            onClick={() => setDrawerOpen(true)}
          >
            <MenuIcon />
          </IconButton>
          {statusChips}
          <Drawer
            anchor="left"
            open={drawerOpen}
            onClose={() => setDrawerOpen(false)}
          >
            <List sx={{ width: 220 }}>
              {navLinks.map((link) => (
                <ListItemButton
                  key={link.to}
                  component={NextLinkAdapter}
                  href={link.to}
                  onClick={() => setDrawerOpen(false)}
                >
                  <ListItemText primary={link.label} />
                </ListItemButton>
              ))}
            </List>
          </Drawer>
        </Toolbar>
      </AppBar>
    );
  }

  return (
    <AppBar sx={style}>
      <Toolbar
        sx={{ justifyContent: "space-between", flexWrap: "wrap", gap: 2 }}
      >
        <Box sx={{ display: "flex", flexWrap: "wrap" }}>{navButtons}</Box>
        {statusChips}
      </Toolbar>
    </AppBar>
  );
}

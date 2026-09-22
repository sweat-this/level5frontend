"use client";

import type { ReactNode } from "react";
import { Roboto } from "next/font/google";
import { AppRouterCacheProvider } from "@mui/material-nextjs/v16-appRouter";
import { ThemeProvider, createTheme } from "@mui/material/styles";

// createTheme() (and the theme object it returns) contains functions, which can't cross the
// Server->Client Component boundary as props - so theme creation has to live inside the client
// boundary itself, not in the (server) root layout that renders this. next/font calls are
// resolved per call-site at build time, so calling Roboto() again here (matching the root
// layout's call, used there for the <html> className) is the normal way to reference the same
// font asset from a second file.
const roboto = Roboto({
  weight: ["300", "400", "500", "700"],
  subsets: ["latin"],
  display: "swap",
});

const theme = createTheme({
  typography: { fontFamily: roboto.style.fontFamily },
});

export default function ThemeRegistry({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <AppRouterCacheProvider>
      <ThemeProvider theme={theme}>{children}</ThemeProvider>
    </AppRouterCacheProvider>
  );
}

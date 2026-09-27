"use client";

import { Box } from "@mui/material";

// The very first focusable element on every page (issue #27): PlatformHeader's global nav (issue
// #21) put 4-5 links before any page's actual content in Tab order, so keyboard/screen-reader
// users had to tab through the whole header on every single page just to reach the thing they
// came for. A skip link is the standard WCAG 2.4.1 (Bypass Blocks) fix - visually hidden until it
// receives focus, then it jumps straight to the <main> landmark. The anchor navigation itself
// needs no client-side JS, but the function-valued `sx` below (theme.zIndex/theme.transitions)
// can only cross the Server->Client Component boundary if this component is a Client Component
// itself - RootLayout that renders it is a Server Component. #scrollableContent's tabIndex={-1}
// (see layout.tsx) makes the <main> landmark itself focusable so focus visibly lands there
// instead of silently scrolling past it.
export default function SkipLink() {
  return (
    <Box
      component="a"
      href="#scrollableContent"
      sx={{
        position: "absolute",
        left: 8,
        top: -48,
        zIndex: (theme) => theme.zIndex.appBar + 1,
        padding: "8px 16px",
        backgroundColor: "background.paper",
        color: "text.primary",
        borderRadius: 1,
        boxShadow: 3,
        // theme.transitions.create() (rather than a raw CSS string) so this automatically
        // respects the theme's reducedMotion: "system" setting (see ThemeRegistry.tsx).
        transition: (theme) =>
          theme.transitions.create("top", { duration: 100 }),
        "&:focus": {
          top: 8,
        },
      }}
    >
      Skip to main content
    </Box>
  );
}

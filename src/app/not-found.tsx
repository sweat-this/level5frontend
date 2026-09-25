import type { Metadata } from "next";
import { Box, Typography } from "@mui/material";
import ButtonLink from "@/Components/ButtonLink";

// Forces this route into the same per-request rendering path as /account/* (issue #10). A
// per-request CSP nonce can never be correct on a page whose HTML is fixed at build time (see
// src/lib/security/headers.ts's module doc comment) - without this, Next serves this page's
// prerendered HTML (baked with no nonce on its inline hydration scripts) alongside a
// proxy-generated CSP header demanding a *different*, freshly-generated nonce, which the
// browser then correctly refuses to execute those scripts against. Unlike the four real static
// public routes, an unmatched/404 path has no meaningful caching value, so this doesn't
// reintroduce the "public caching lost" regression this same nonce work already caused once.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sweat This - Page Not Found",
  description: "The page you were looking for could not be found.",
};

export default function NotFound() {
  return (
    <Box sx={{ textAlign: "center", padding: "4em 1em" }}>
      <Typography variant="h4" gutterBottom>
        Page not found
      </Typography>
      <ButtonLink href="/" variant="contained">
        Back home
      </ButtonLink>
    </Box>
  );
}

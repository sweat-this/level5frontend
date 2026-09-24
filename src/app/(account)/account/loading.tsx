import { Box, CircularProgress } from "@mui/material";

export default function AccountLoading() {
  return (
    <Box
      role="status"
      aria-live="polite"
      aria-label="Loading account"
      sx={{ display: "flex", justifyContent: "center", paddingY: 6 }}
    >
      {/* The wrapping status role + aria-label above already announces "Loading account" - the
      spinner icon itself is purely decorative, so it's hidden from the accessibility tree rather
      than also needing its own accessible name (axe: aria-progressbar-name). */}
      <CircularProgress aria-hidden="true" />
    </Box>
  );
}

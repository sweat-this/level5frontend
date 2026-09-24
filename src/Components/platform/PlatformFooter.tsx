import { Box, Container, Stack, Typography } from "@mui/material";
import Link from "next/link";
import { PLATFORM_DESTINATIONS } from "@/lib/platform/destinations";

// Real Sweat This brand/navigation footer only (issue #21) - no invented legal/social/store
// content. Stays a Server Component: nothing here needs browser state.
export default function PlatformFooter() {
  return (
    <Box component="footer" sx={{ borderTop: 1, borderColor: "divider" }}>
      <Container maxWidth="lg">
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={2}
          sx={{
            alignItems: { sm: "center" },
            justifyContent: "space-between",
            paddingY: 3,
          }}
        >
          <Typography variant="body2" color="text.secondary">
            Sweat This
          </Typography>
          <Stack
            component="nav"
            aria-label="Footer"
            direction="row"
            spacing={3}
            sx={{ flexWrap: "wrap" }}
          >
            {PLATFORM_DESTINATIONS.map((destination) => (
              <Link key={destination.href} href={destination.href}>
                {destination.label}
              </Link>
            ))}
          </Stack>
        </Stack>
      </Container>
    </Box>
  );
}

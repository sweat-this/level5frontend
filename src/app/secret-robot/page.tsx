import type { Metadata } from "next";
import { Box, Container, Stack, Typography } from "@mui/material";
import GameCard from "@/Components/GameCard";

const title = "Sweat This - Secret Robot";
const description =
  "Secret Robot is set in the Murder Lands, a vast, violent, and often absurd world where broken infrastructure, crime, and strange technology collide.";

export const metadata: Metadata = {
  title,
  description,
  // No approved Secret Robot title art exists yet, so no images here - same precedent as the
  // root layout's own openGraph/twitter (src/app/layout.tsx). Without this, the platform-level
  // root layout's generic "Sweat This" openGraph/twitter would apply instead, since Next only
  // inherits those objects wholesale from the nearest ancestor that defines them.
  openGraph: { title, description },
  twitter: { card: "summary", title, description },
};

// Secret Robot public hub (issue #24) - static Server Component. Deliberately concise, not a
// lore dump: identity, then where to go next. Copy is grounded in codex's approved
// docs/murderlands/world-bible.md world-identity line, trimmed. No hidden-lore or discovery-path
// material belongs here - see /secret-robot/world and /secret-robot/characters for the same
// boundary.
export default function Page() {
  return (
    <Container maxWidth="lg" sx={{ paddingY: { xs: 4, md: 6 } }}>
      <Stack spacing={{ xs: 5, md: 7 }}>
        <Box component="section" sx={{ textAlign: "center" }}>
          <Typography component="h1" variant="h2" sx={{ fontWeight: 700 }}>
            Secret Robot
          </Typography>
          <Typography
            variant="h6"
            component="p"
            color="text.secondary"
            sx={{ marginTop: 1 }}
          >
            {description}
          </Typography>
        </Box>

        <Box component="section" aria-labelledby="explore-heading">
          <Typography
            id="explore-heading"
            component="h2"
            variant="h4"
            sx={{ marginBottom: 3, textAlign: { xs: "center", md: "left" } }}
          >
            Explore Secret Robot
          </Typography>
          <Stack
            direction={{ xs: "column", md: "row" }}
            spacing={3}
            sx={{ alignItems: "stretch" }}
          >
            <GameCard
              headingId="world-heading"
              title="World"
              description="A few of the places across the Murder Lands."
              action={{ label: "See World", href: "/secret-robot/world" }}
            />
            <GameCard
              headingId="characters-heading"
              title="Characters"
              description="A few of the people who inhabit this world."
              action={{
                label: "See Characters",
                href: "/secret-robot/characters",
              }}
            />
          </Stack>
        </Box>
      </Stack>
    </Container>
  );
}

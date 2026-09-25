import type { Metadata } from "next";
import { Box, Container, Stack, Typography } from "@mui/material";
import GameCard from "@/Components/GameCard";
import ButtonLink from "@/Components/ButtonLink";

const title = "Sweat This - Level 5";
const description =
  "Level 5 is a basketball and action game with multiple gameplay modes, combat and progression, and local or versus play.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: { title, description, images: ["/images/logo.png"] },
  twitter: { title, description, images: ["/images/logo.png"] },
};

// Level 5 public hub (issue #23) - static Server Component, replacing the legacy ScoresTable
// homepage role (moved to /level5/leaderboards). Answers what Level 5 is and where to go next;
// does not expose server health/version, live leaderboard data, or account statistics - see
// AGENTS.md/#23 for why. Copy is grounded in the current Unity mode characterization and versus
// architecture (see modeCatalog.ts and Versus.tsx for exact sourcing) and the same approved
// description already used on the Sweat This homepage's GameCard.
export default function Page() {
  return (
    <Container maxWidth="lg" sx={{ paddingY: { xs: 4, md: 6 } }}>
      <Stack spacing={{ xs: 5, md: 7 }}>
        <Box component="section" sx={{ textAlign: "center" }}>
          <Typography component="h1" variant="h2" sx={{ fontWeight: 700 }}>
            Level 5
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
            Explore Level 5
          </Typography>
          <Stack
            direction={{ xs: "column", md: "row" }}
            spacing={3}
            sx={{ alignItems: "stretch" }}
          >
            <GameCard
              headingId="modes-heading"
              title="Modes"
              description="Basketball scoring and skill, shot contests, combat, CPU and progression modes, and open play."
              action={{ label: "See Modes", href: "/level5/modes" }}
            />
            <GameCard
              headingId="characters-heading"
              title="Characters"
              description="Meet the playable characters in Level 5."
              action={{ label: "See Characters", href: "/level5/characters" }}
            />
            <GameCard
              headingId="versus-heading"
              title="Versus"
              description="CPU Versus, and asynchronous correspondence series between two players."
              action={{ label: "See Versus", href: "/level5/versus" }}
            />
          </Stack>
        </Box>

        <Box
          component="section"
          aria-labelledby="drblood-heading"
          sx={{ textAlign: "center" }}
        >
          <Typography
            id="drblood-heading"
            component="h2"
            variant="subtitle1"
            color="text.secondary"
            sx={{ marginBottom: 1 }}
          >
            Dr Blood videos &amp; highlights
          </Typography>
          <ButtonLink href="/level5/drblood" variant="outlined">
            Watch Dr Blood
          </ButtonLink>
        </Box>
      </Stack>
    </Container>
  );
}

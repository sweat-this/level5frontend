import type { Metadata } from "next";
import { Box, Container, Stack, Typography } from "@mui/material";
import ButtonLink from "@/Components/ButtonLink";
import GameCard from "@/Components/GameCard";

const title = "Sweat This";
const description =
  "Sweat This is home to Level 5 and Secret Robot. Explore both games or create an account.";

export const metadata: Metadata = {
  title,
  description,
};

// Sweat This platform homepage (issue #22) - static Server Component, games-first: platform
// identity, then Level 5 and Secret Robot, then secondary Create Account/Sign In entry points.
// Secret Robot has no real destination or approved imagery/description yet (issue #24), so its
// card stays a non-interactive, non-focusable presentation rather than linking anywhere.
export default function Page() {
  return (
    <Container maxWidth="lg" sx={{ paddingY: { xs: 4, md: 6 } }}>
      <Stack spacing={{ xs: 5, md: 7 }}>
        <Box component="section" sx={{ textAlign: "center" }}>
          <Typography component="h1" variant="h2" sx={{ fontWeight: 700 }}>
            Sweat This
          </Typography>
          <Typography
            variant="h6"
            component="p"
            color="text.secondary"
            sx={{ marginTop: 1 }}
          >
            Sweat This is home to Level 5 and Secret Robot.
          </Typography>
        </Box>

        <Box component="section" aria-labelledby="games-heading">
          <Typography
            id="games-heading"
            component="h2"
            variant="h4"
            sx={{ marginBottom: 3, textAlign: { xs: "center", md: "left" } }}
          >
            Games
          </Typography>
          <Stack
            direction={{ xs: "column", md: "row" }}
            spacing={3}
            sx={{ alignItems: "stretch" }}
          >
            <GameCard
              headingId="level5-heading"
              title="Level 5"
              description="Level 5 is a basketball and action game with multiple gameplay modes, combat and progression, and local or versus play."
              image={{
                src: "/images/logo.png",
                alt: "Level 5 logo",
                // Sized to GameCard's ~220px display box (same 800:868 ratio as the source
                // file), not the source's full intrinsic size - keeps the generated srcset from
                // fetching a needlessly large variant for a small display.
                width: 203,
                height: 220,
                preload: true,
              }}
              action={{ label: "Explore Level 5", href: "/level5" }}
            />
            <GameCard
              headingId="secret-robot-heading"
              title="Secret Robot"
              description="Secret Robot is a Sweat This game."
            />
          </Stack>
        </Box>

        <Box
          component="section"
          aria-labelledby="account-heading"
          sx={{ textAlign: "center" }}
        >
          <Typography
            id="account-heading"
            component="h2"
            variant="subtitle1"
            color="text.secondary"
            sx={{ marginBottom: 1 }}
          >
            Account
          </Typography>
          <Stack
            direction="row"
            spacing={2}
            sx={{ justifyContent: "center", flexWrap: "wrap" }}
          >
            <ButtonLink
              href="/account/register"
              variant="outlined"
              size="small"
            >
              Create Account
            </ButtonLink>
            <ButtonLink href="/account/login" variant="text" size="small">
              Sign In
            </ButtonLink>
          </Stack>
        </Box>
      </Stack>
    </Container>
  );
}

import { Box, Stack, Typography } from "@mui/material";
import ButtonLink from "@/Components/ButtonLink";

// Static Server Component (issue #23) - a public explanation of Level 5 competitive play. Keeps
// CPU Versus (an ordinary CPU-oriented scoring mode) and correspondence (the asynchronous,
// Backend-authoritative series system) visibly distinct - see docs/versus-architecture.md and
// Assets/Scripts/versus/Level5Versus/DefaultCompetitiveRulesets.cs in the Level 5 Unity repo,
// audited at commit 42fe2ed468dc1ce1e18722f422ea7c0149aa7837, which is what this page's wording is
// grounded in. Deliberately does not reproduce the full architecture/protocol documentation or the
// per-mode compatibility matrix, and offers no web challenge-creation action - only "View
// Challenges", since the web account portal can manage existing series but not create them yet.
export default function Versus() {
  return (
    <Stack spacing={{ xs: 5, md: 6 }}>
      <Box component="section">
        <Typography component="h1" variant="h3" sx={{ fontWeight: 700 }}>
          Versus
        </Typography>
        <Typography
          variant="h6"
          component="p"
          color="text.secondary"
          sx={{ marginTop: 1 }}
        >
          Level 5 has two different kinds of competitive play.
        </Typography>
      </Box>

      <Box component="section" aria-labelledby="cpu-versus-heading">
        <Typography
          id="cpu-versus-heading"
          component="h2"
          variant="h5"
          sx={{ marginBottom: 1 }}
        >
          CPU Versus
        </Typography>
        <Typography variant="body1">
          Versus is an in-game scoring mode played against CPU opponents. It
          runs entirely inside one play session and is not the same system as
          correspondence play below.
        </Typography>
      </Box>

      <Box component="section" aria-labelledby="correspondence-heading">
        <Typography
          id="correspondence-heading"
          component="h2"
          variant="h5"
          sx={{ marginBottom: 1 }}
        >
          Correspondence
        </Typography>
        <Typography variant="body1" sx={{ marginBottom: 2 }}>
          Correspondence lets two people compete in a series without being
          online at the same time. Each player takes their attempt on their own
          schedule; a series is decided across a best-of-N set of games, and the
          current state of a series is kept by the Sweat This backend.
        </Typography>
        <Typography variant="body1">
          Eligible scoring and shooting modes can be played through
          correspondence competition - for example, Total Points and 3 Point
          Contest. Combat, CPU, and open-play modes are not part of
          correspondence.
        </Typography>
      </Box>

      <Box component="section" sx={{ textAlign: { xs: "center", md: "left" } }}>
        <ButtonLink href="/account/challenges" variant="contained">
          View Challenges
        </ButtonLink>
      </Box>
    </Stack>
  );
}

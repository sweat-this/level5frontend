import type { Metadata } from "next";
import {
  Box,
  Card,
  CardContent,
  Container,
  Grid,
  Stack,
  Typography,
} from "@mui/material";

const title = "Sweat This - Secret Robot Characters";
const description = "A few of the people who inhabit Secret Robot's world.";

export const metadata: Metadata = {
  title,
  description,
  // See secret-robot/page.tsx's metadata comment - without this, the root layout's generic
  // "Sweat This" openGraph/twitter would apply here instead.
  openGraph: { title, description },
  twitter: { card: "summary", title, description },
};

// Static Server Component (issue #24). Text-first: no approved character portraits exist yet, and
// this issue does not generate new character art. Identity lines are trimmed from codex's
// APPROVED docs/murderlands/character-bible.md - deliberately brief (no vehicles, dates, or
// relationship trees) and does not label anyone as playable or a confirmed launch roster, since
// launch availability for several of these is still open in that source.
const CHARACTERS: ReadonlyArray<{ name: string; description: string }> = [
  {
    name: "Dr. Blood",
    description: "A masked figure at the center of it all.",
  },
  { name: "Justin", description: "Runs a taxi service." },
  { name: "Sarah Young", description: "An architect and Chief of Police." },
  { name: "Stu", description: "A lawyer who loves cats." },
  { name: "Harry Charles", description: "An older taxi driver, well loved." },
  { name: "Richard Charles", description: "Runs a construction company." },
  {
    name: "Patrick & Zilla",
    description: "A father and daughter, always together.",
  },
];

export default function Page() {
  return (
    <Container maxWidth="lg" sx={{ paddingY: { xs: 4, md: 6 } }}>
      <Stack spacing={{ xs: 4, md: 5 }}>
        <Stack component="section" sx={{ textAlign: "center" }} spacing={1}>
          <Typography component="h1" variant="h2" sx={{ fontWeight: 700 }}>
            Characters
          </Typography>
          <Typography variant="h6" component="p" color="text.secondary">
            {description}
          </Typography>
        </Stack>

        <Box component="section" aria-labelledby="characters-heading">
          <Typography
            id="characters-heading"
            component="h2"
            variant="h4"
            sx={{ marginBottom: 3, textAlign: { xs: "center", md: "left" } }}
          >
            Meet a Few of Them
          </Typography>
          <Grid container spacing={2}>
            {CHARACTERS.map((character) => (
              <Grid key={character.name} size={{ xs: 12, sm: 6, md: 4 }}>
                <Card variant="outlined" sx={{ height: "100%" }}>
                  <CardContent>
                    <Typography component="h3" variant="h6" gutterBottom>
                      {character.name}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {character.description}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Box>
      </Stack>
    </Container>
  );
}

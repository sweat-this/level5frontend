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

const title = "Sweat This - Secret Robot World";
const description =
  "A few of the places across the Murder Lands, the world of Secret Robot.";

export const metadata: Metadata = {
  title,
  description,
  // See secret-robot/page.tsx's metadata comment - without this, the root layout's generic
  // "Sweat This" openGraph/twitter would apply here instead.
  openGraph: { title, description },
  twitter: { card: "summary", title, description },
};

// Static Server Component (issue #24). Not a canonical/interactive map - codex's world-bible.md
// explicitly leaves the exact silhouette, boundaries, and many placements open ("The exact map
// silhouette, dimensions, and permanent names remain open"), so this stays a flat, high-level list
// rather than implying fixed geography. Region names/descriptions are trimmed from codex's
// approved docs/murderlands/world-bible.md - no hidden-layer, buried-civilization, or
// secret-system material belongs here (see docs/murderlands/environment/secret-regions.md and
// systems/blood-army.md, which this page does not draw from).
const REGIONS: ReadonlyArray<{ name: string; description: string }> = [
  { name: "Skyfall Basin", description: "A scarred impact region." },
  {
    name: "Desert Wastes",
    description: "A vast, dry expanse at the heart of the world.",
  },
  { name: "Red Dunes", description: "Deep, largely unmapped sand seas." },
  {
    name: "Long Straight",
    description: "A long road connecting distant places.",
  },
  {
    name: "Rust Orchard",
    description: "A rusted, overgrown industrial edge.",
  },
  { name: "Black Pump", description: "An oil, fuel, and industry region." },
  {
    name: "Great Yard",
    description: "A vast burial and salvage ground.",
  },
  { name: "Glass Country", description: "Strange, glassy, fused terrain." },
  {
    name: "White Wound",
    description: "Pale salt flats, chalk, and sinkholes.",
  },
  {
    name: "Drowned Strip",
    description: "A flooded southern strip of canals and towns.",
  },
];

export default function Page() {
  return (
    <Container maxWidth="lg" sx={{ paddingY: { xs: 4, md: 6 } }}>
      <Stack spacing={{ xs: 4, md: 5 }}>
        <Stack component="section" sx={{ textAlign: "center" }} spacing={1}>
          <Typography component="h1" variant="h2" sx={{ fontWeight: 700 }}>
            World
          </Typography>
          <Typography variant="h6" component="p" color="text.secondary">
            {description}
          </Typography>
        </Stack>

        <Box component="section" aria-labelledby="regions-heading">
          <Typography
            id="regions-heading"
            component="h2"
            variant="h4"
            sx={{ marginBottom: 3, textAlign: { xs: "center", md: "left" } }}
          >
            Regions
          </Typography>
          <Grid container spacing={2}>
            {REGIONS.map((region) => (
              <Grid key={region.name} size={{ xs: 12, sm: 6, md: 4 }}>
                <Card variant="outlined" sx={{ height: "100%" }}>
                  <CardContent>
                    <Typography component="h3" variant="h6" gutterBottom>
                      {region.name}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {region.description}
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

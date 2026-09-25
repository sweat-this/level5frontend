import { Box, Grid, Stack, Typography } from "@mui/material";
import ModeCard from "./ModeCard";
import { MODE_CATALOG } from "./modeCatalog";

// Static Server Component (issue #23) - the full authored mode catalog, grouped into a small
// public taxonomy. See modeCatalog.ts for the source of truth and what is deliberately excluded.
export default function Modes() {
  return (
    <Stack spacing={{ xs: 5, md: 6 }}>
      <Box component="section">
        <Typography component="h1" variant="h3" sx={{ fontWeight: 700 }}>
          Modes
        </Typography>
        <Typography
          variant="h6"
          component="p"
          color="text.secondary"
          sx={{ marginTop: 1 }}
        >
          Level 5&apos;s authored gameplay modes, grouped by what they ask of
          you.
        </Typography>
      </Box>
      {MODE_CATALOG.map((category) => {
        const headingId = `${category.id}-heading`;
        return (
          <Box
            key={category.id}
            component="section"
            aria-labelledby={headingId}
          >
            <Typography
              id={headingId}
              component="h2"
              variant="h5"
              sx={{ marginBottom: 2 }}
            >
              {category.title}
            </Typography>
            <Grid container spacing={2}>
              {category.modes.map((mode) => (
                <Grid key={mode.name} size={{ xs: 12, sm: 6, md: 4 }}>
                  <ModeCard
                    headingId={`${category.id}-${mode.name}`.replace(
                      /\s+/g,
                      "-",
                    )}
                    name={mode.name}
                    description={mode.description}
                  />
                </Grid>
              ))}
            </Grid>
          </Box>
        );
      })}
    </Stack>
  );
}

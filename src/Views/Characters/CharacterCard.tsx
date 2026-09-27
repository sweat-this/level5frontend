import { Card, CardContent, CardMedia, Grid, Typography } from "@mui/material";

// No CardActionArea here (issue #27): a character card has no href/onClick/navigation - wrapping
// it in CardActionArea exposed keyboard-focusable button semantics for an activation that did
// nothing, which axe/WCAG 2.2 and screen-reader users alike would reasonably expect to be
// operable. Plain Card/CardMedia/CardContent preserves the same visual presentation without
// claiming interactivity the card doesn't have.
export default function CharacterCard({
  image,
  title,
  name,
}: Readonly<{
  image: string | undefined;
  title: string | undefined;
  name: string;
}>) {
  return (
    <Grid
      container
      size={12}
      sx={{ alignContent: "left", justifyContent: "left" }}
    >
      <Grid sx={{ alignContent: "left", justifyContent: "left" }}>
        <Card sx={{ maxWidth: 300 }}>
          <CardMedia component="img" height="300" image={image} alt={title} />
          <CardContent>
            <Typography
              gutterBottom
              variant="h5"
              component="div"
              color="text.primary"
            >
              {name}
            </Typography>
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );
}

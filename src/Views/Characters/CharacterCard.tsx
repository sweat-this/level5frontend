import {
  Card,
  CardActionArea,
  CardContent,
  CardMedia,
  Grid,
  Typography,
} from "@mui/material";

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
          <CardActionArea>
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
          </CardActionArea>
        </Card>
      </Grid>
    </Grid>
  );
}

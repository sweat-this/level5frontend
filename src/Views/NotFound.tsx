import { Box, Typography } from "@mui/material";
import ButtonLink from "../Components/ButtonLink";
import usePageMeta from "../hooks/usePageMeta";

export default function NotFound() {
  usePageMeta({
    title: "Sweat This - Page Not Found",
    description: "The page you were looking for could not be found.",
  });

  return (
    <Box sx={{ textAlign: "center", padding: "4em 1em" }}>
      <Typography variant="h4" gutterBottom>
        Page not found
      </Typography>
      <ButtonLink to="/" variant="contained">
        Back home
      </ButtonLink>
    </Box>
  );
}

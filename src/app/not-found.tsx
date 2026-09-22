import type { Metadata } from "next";
import { Box, Typography } from "@mui/material";
import ButtonLink from "@/Components/ButtonLink";

export const metadata: Metadata = {
  title: "Sweat This - Page Not Found",
  description: "The page you were looking for could not be found.",
};

export default function NotFound() {
  return (
    <Box sx={{ textAlign: "center", padding: "4em 1em" }}>
      <Typography variant="h4" gutterBottom>
        Page not found
      </Typography>
      <ButtonLink href="/" variant="contained">
        Back home
      </ButtonLink>
    </Box>
  );
}

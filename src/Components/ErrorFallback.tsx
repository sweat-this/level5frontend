import { Box, Button, Typography } from "@mui/material";

export default function ErrorFallback() {
  return (
    <Box sx={{ textAlign: "center", padding: "4em 1em" }}>
      <Typography variant="h4" gutterBottom>
        Something went wrong.
      </Typography>
      {/* Plain anchor, not NextLinkAdapter: this fallback may render when app routing/rendering
      itself is broken, so it deliberately doesn't depend on that context being intact. */}
      <Button href="/" variant="contained">
        Back home
      </Button>
    </Box>
  );
}

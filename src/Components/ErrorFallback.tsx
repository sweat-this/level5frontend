import { Box, Button, Typography } from "@mui/material";

/**
 * `digest` is Next's own opaque per-error id (App Router's error.tsx receives it as
 * `error.digest`) - the same value instrumentation.ts's onRequestError hook logs server-side
 * (see src/lib/otel/register.ts), so support can correlate what a player saw with the matching
 * server log line. Never a stack trace or raw exception message - those never reach this
 * component in the first place (error.tsx never passes them through).
 */
export default function ErrorFallback({
  digest,
}: {
  readonly digest?: string;
}) {
  return (
    <Box sx={{ textAlign: "center", padding: "4em 1em" }}>
      <Typography variant="h4" gutterBottom>
        Something went wrong.
      </Typography>
      {digest && (
        <Typography variant="body2" color="text.secondary" gutterBottom>
          Reference: {digest}
        </Typography>
      )}
      {/* Plain anchor, not NextLinkAdapter: this fallback may render when app routing/rendering
      itself is broken, so it deliberately doesn't depend on that context being intact. */}
      <Button href="/" variant="contained">
        Back home
      </Button>
    </Box>
  );
}

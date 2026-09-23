import { Box, CircularProgress } from "@mui/material";

export default function AccountLoading() {
  return (
    <Box
      role="status"
      aria-live="polite"
      aria-label="Loading account"
      sx={{ display: "flex", justifyContent: "center", paddingY: 6 }}
    >
      <CircularProgress />
    </Box>
  );
}

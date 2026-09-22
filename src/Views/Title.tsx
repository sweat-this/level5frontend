import { Box, CardMedia, Stack } from "@mui/material";
import Link from "next/link";

export default function Title() {
  return (
    <Box sx={{ flexGrow: 1 }}>
      <Stack
        sx={{
          padding: "1em 1em 0 1em",
          alignItems: "center",
          justifyContent: "center",
        }}
        spacing={2}
      >
        <Link href="/level5">
          <CardMedia
            component="img"
            image="/images/logo.png"
            alt="Level 5 logo"
            title="Level 5"
            sx={{
              padding: 0,
              height: { xs: 220, sm: 350, md: 500 },
              width: "auto",
              maxWidth: "100%",
            }}
          />
        </Link>
      </Stack>
    </Box>
  );
}

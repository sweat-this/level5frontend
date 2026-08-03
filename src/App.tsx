import { Suspense } from "react";
import { Outlet } from "react-router-dom";
import { Box, CircularProgress } from "@mui/material";

function App() {
  return (
    <Suspense
      fallback={
        <Box
          sx={{ display: "flex", justifyContent: "center", paddingTop: "4em" }}
        >
          <CircularProgress />
        </Box>
      }
    >
      <Outlet />
    </Suspense>
  );
}

export default App;

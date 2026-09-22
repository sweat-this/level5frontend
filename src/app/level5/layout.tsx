import { Grid } from "@mui/material";
import MainNavBar from "@/Components/MainNavBar";

export default function Level5Layout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <Grid id="header">
        <MainNavBar />
      </Grid>
      {children}
    </>
  );
}

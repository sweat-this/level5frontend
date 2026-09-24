import { Grid } from "@mui/material";
import MainNavBar from "@/Components/MainNavBar";
import QueryProvider from "@/lib/query/QueryProvider";

// @tanstack/react-query is only ever used here - MainNavBar's useServerHealth/useCurrentVersion
// and ScoresTable's useHighscores (issue #10's bundle/perf review, measured: ~40KB of react-query
// code was shipping to every route via the root layout, including / and /account/*, none of
// which use it). Scoped to this layout instead of the root one, so only /level5/* pays for it.
export default function Level5Layout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <QueryProvider>
      <Grid id="header">
        <MainNavBar />
      </Grid>
      {children}
    </QueryProvider>
  );
}

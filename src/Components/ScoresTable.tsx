"use client";

import { Box, CircularProgress, Grid, Paper, Typography } from "@mui/material";
import { useState } from "react";
import { GridPaginationModel } from "@mui/x-data-grid";
import DataTable from "./DataTable";
import highscoreColumns from "./highscoreColumns";
import useHighscores from "../lib/backend-v1-public/hooks/useHighscores";

const DEFAULT_PAGE_SIZE = 50;

export default function ScoresTable() {
  const [page, setPage] = useState(0);
  const [results, setResults] = useState(DEFAULT_PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const { data, isError, isPending } = useHighscores(page, results);

  const handlePaginationChange = (model: GridPaginationModel) => {
    setPage(model.page);
    setResults(model.pageSize);
  };

  // DataTable's own effect flips `loading` to false the instant it receives a `content` array -
  // even an empty placeholder one - so it can't mount until real data exists, or the spinner
  // below would disappear before the first fetch actually resolves. `keepPreviousData` in
  // useHighscores means `data` stays populated across later page changes, so this only affects
  // the very first load.
  let body;
  if (isError) {
    body = <Typography color="error">Failed to load high scores.</Typography>;
  } else if (isPending || !data) {
    body = (
      <Box
        role="status"
        aria-label="Loading high scores"
        sx={{ display: "flex", justifyContent: "center", paddingTop: "4em" }}
      >
        <CircularProgress aria-hidden="true" />
      </Box>
    );
  } else {
    body = (
      // /api/highscores has no server-side filter/sort support - the controls are disabled
      // rather than shown as usable and silently doing nothing.
      <DataTable
        columns={highscoreColumns}
        data={data}
        onPaginationChange={handlePaginationChange}
        loading={loading}
        setLoading={setLoading}
        disableColumnFilter
        disableColumnSorting
      />
    );
  }

  return (
    <Paper square={false}>
      <Grid container size={12}>
        <Grid size={12}>
          <Grid>
            <Typography variant="h6">Level 5 High Scores</Typography>
          </Grid>
          <Box sx={{ height: { xs: 500, sm: 800, md: 1200 }, width: "100%" }}>
            {body}
          </Box>
        </Grid>
      </Grid>
    </Paper>
  );
}

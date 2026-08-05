import { Box } from "@mui/material";
import ScoresTable from "../Components/ScoresTable";
import usePageMeta from "../hooks/usePageMeta";

export default function Home() {
  usePageMeta({
    title: "Sweat This - High Scores",
    description: "Browse Level 5 high scores and leaderboard stats.",
  });

  return (
    <Box>
      <ScoresTable />
    </Box>
  );
}

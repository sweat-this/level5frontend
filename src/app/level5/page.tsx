import type { Metadata } from "next";
import ScoresTable from "@/Components/ScoresTable";

const title = "Sweat This - High Scores";
const description = "Browse Level 5 high scores and leaderboard stats.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: { title, description, images: ["/images/logo.png"] },
  twitter: { title, description, images: ["/images/logo.png"] },
};

export default function Page() {
  return <ScoresTable />;
}

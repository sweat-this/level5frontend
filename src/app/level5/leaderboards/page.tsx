import type { Metadata } from "next";
import ScoresTable from "@/Components/ScoresTable";
import QueryProvider from "@/lib/query/QueryProvider";

const title = "Sweat This - High Scores";
const description = "Browse Level 5 high scores and leaderboard stats.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: { title, description, images: ["/images/logo.png"] },
  twitter: { title, description, images: ["/images/logo.png"] },
};

// Relocated from /level5 (issue #23) - preserved verbatim (QueryProvider + ScoresTable, legacy V1
// high-score integration) at its own route. Intentionally unadvertised: not linked from
// PlatformHeader, PlatformFooter, GameLocalNav, or the Level 5 hub's primary links, until a
// hosted production results pipeline exists. Still directly addressable.
export default function Page() {
  return (
    <QueryProvider>
      <ScoresTable />
    </QueryProvider>
  );
}

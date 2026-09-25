import GameLocalNav from "@/Components/platform/GameLocalNav";

// Level 5 local navigation (issue #23). The brand/home link (gameHref below) already resolves to
// /level5, which is now the hub/overview - no separate "Overview" item is added merely to
// duplicate that destination. Scores/Leaderboards and Dr Blood are deliberately left off primary
// navigation: leaderboards stay unadvertised until a hosted production results path exists, and Dr
// Blood remains discoverable from the hub instead (see /level5/page.tsx) rather than promoted to a
// primary nav item.
const LEVEL5_NAV_ITEMS = [
  { label: "Modes", href: "/level5/modes" },
  { label: "Characters", href: "/level5/characters" },
  { label: "Versus", href: "/level5/versus" },
];

export default function Level5Layout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <GameLocalNav
        gameLabel="Level 5"
        gameHref="/level5"
        items={LEVEL5_NAV_ITEMS}
      />
      {children}
    </>
  );
}

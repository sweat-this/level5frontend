import GameLocalNav from "@/Components/platform/GameLocalNav";

// Level 5's actual current routes only (issue #21) - /level5/modes and /level5/versus don't exist
// yet and belong to issue #23, which also owns relabeling this navigation model (Overview/Modes/
// Characters/Versus). /level5 itself is labeled "Scores" - that's what the page actually shows.
const LEVEL5_NAV_ITEMS = [
  { label: "Scores", href: "/level5" },
  { label: "Characters", href: "/level5/characters" },
  { label: "Dr Blood", href: "/level5/drblood" },
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

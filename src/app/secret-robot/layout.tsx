import GameLocalNav from "@/Components/platform/GameLocalNav";

// Secret Robot local navigation (issue #24), mirroring level5/layout.tsx. The brand/home link
// (gameHref below) already resolves to /secret-robot, which is the overview - no separate
// "Overview" item is added merely to duplicate that destination. No Media item: no distinct
// approved media collection exists yet to justify that route (see /secret-robot/page.tsx).
const SECRET_ROBOT_NAV_ITEMS = [
  { label: "World", href: "/secret-robot/world" },
  { label: "Characters", href: "/secret-robot/characters" },
];

export default function SecretRobotLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <GameLocalNav
        gameLabel="Secret Robot"
        gameHref="/secret-robot"
        items={SECRET_ROBOT_NAV_ITEMS}
        accentColor="error.dark"
      />
      {children}
    </>
  );
}

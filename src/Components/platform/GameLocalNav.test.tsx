import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import GameLocalNav from "./GameLocalNav";

const usePathnameMock = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => usePathnameMock(),
}));

afterEach(() => {
  vi.restoreAllMocks();
});

const LEVEL5_ITEMS = [
  { label: "Scores", href: "/level5" },
  { label: "Characters", href: "/level5/characters" },
  { label: "Dr Blood", href: "/level5/drblood" },
];

describe("GameLocalNav", () => {
  it("renders a nav landmark labeled with the game name", () => {
    usePathnameMock.mockReturnValue("/level5");
    render(
      <GameLocalNav
        gameLabel="Level 5"
        gameHref="/level5"
        items={LEVEL5_ITEMS}
      />,
    );
    expect(
      screen.getByRole("navigation", { name: "Level 5 navigation" }),
    ).toBeInTheDocument();
  });

  it("makes the current valid Level 5 routes reachable", () => {
    usePathnameMock.mockReturnValue("/level5");
    render(
      <GameLocalNav
        gameLabel="Level 5"
        gameHref="/level5"
        items={LEVEL5_ITEMS}
      />,
    );

    expect(screen.getByRole("link", { name: "Scores" })).toHaveAttribute(
      "href",
      "/level5",
    );
    expect(screen.getByRole("link", { name: "Characters" })).toHaveAttribute(
      "href",
      "/level5/characters",
    );
    expect(screen.getByRole("link", { name: "Dr Blood" })).toHaveAttribute(
      "href",
      "/level5/drblood",
    );
  });

  it("never renders Modes or Versus - those routes don't exist yet", () => {
    usePathnameMock.mockReturnValue("/level5");
    render(
      <GameLocalNav
        gameLabel="Level 5"
        gameHref="/level5"
        items={LEVEL5_ITEMS}
      />,
    );

    expect(screen.queryByText(/modes/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/versus/i)).not.toBeInTheDocument();
  });

  it("marks the active local route with aria-current", () => {
    usePathnameMock.mockReturnValue("/level5/characters");
    render(
      <GameLocalNav
        gameLabel="Level 5"
        gameHref="/level5"
        items={LEVEL5_ITEMS}
      />,
    );

    expect(screen.getByRole("link", { name: "Characters" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Scores" })).not.toHaveAttribute(
      "aria-current",
    );
  });
});

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import Page from "./page";

// Issue #23: /level5 is the public game hub, not the leaderboard - ScoresTable/QueryProvider
// moved to /level5/leaderboards (see leaderboards/page.tsx).
describe("app/level5/page.tsx (Level 5 hub)", () => {
  it("renders exactly one h1, naming Level 5", () => {
    render(<Page />);

    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent("Level 5");
  });

  it("no longer renders the leaderboard/high-scores table as primary content", () => {
    render(<Page />);

    expect(screen.queryByText("Level 5 High Scores")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("columnheader", { name: /score/i }),
    ).not.toBeInTheDocument();
  });

  it("links to Modes, Characters, and Versus", () => {
    render(<Page />);

    expect(screen.getByRole("link", { name: "See Modes" })).toHaveAttribute(
      "href",
      "/level5/modes",
    );
    expect(
      screen.getByRole("link", { name: "See Characters" }),
    ).toHaveAttribute("href", "/level5/characters");
    expect(screen.getByRole("link", { name: "See Versus" })).toHaveAttribute(
      "href",
      "/level5/versus",
    );
  });

  it("deliberately links to the preserved Dr Blood content", () => {
    render(<Page />);

    expect(
      screen.getByRole("link", { name: "Watch Dr Blood" }),
    ).toHaveAttribute("href", "/level5/drblood");
  });

  it("does not link to /level5/leaderboards - it stays unadvertised", () => {
    render(<Page />);

    expect(
      screen.queryByRole("link", { name: /leaderboard/i }),
    ).not.toBeInTheDocument();
  });

  it("does not expose server health, version, or account statistics", () => {
    render(<Page />);

    expect(screen.queryByText(/^(Online|Offline)$/)).not.toBeInTheDocument();
    expect(screen.queryByText("Version")).not.toBeInTheDocument();
  });
});

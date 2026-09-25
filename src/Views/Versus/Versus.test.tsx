import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import Versus from "./Versus";

describe("Versus", () => {
  it("renders exactly one h1", () => {
    render(<Versus />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("distinguishes CPU Versus from correspondence", () => {
    render(<Versus />);

    expect(
      screen.getByRole("heading", { level: 2, name: "CPU Versus" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "Correspondence" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/is not the same system as correspondence/i),
    ).toBeInTheDocument();
  });

  it("presents a View Challenges CTA, not a web challenge-creation action", () => {
    render(<Versus />);

    expect(
      screen.getByRole("link", { name: "View Challenges" }),
    ).toHaveAttribute("href", "/account/games/level5/challenges");

    for (const forbidden of [
      "Create Challenge",
      "Start Match",
      "Play in Browser",
    ]) {
      expect(screen.queryByText(forbidden)).not.toBeInTheDocument();
    }
  });
});

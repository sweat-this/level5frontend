import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import GameCard from "./GameCard";

describe("GameCard", () => {
  it("renders a primary action link when one is provided", () => {
    render(
      <GameCard
        headingId="level5-heading"
        title="Level 5"
        description="A basketball and action game."
        action={{ label: "Explore Level 5", href: "/level5" }}
      />,
    );

    expect(
      screen.getByRole("heading", { level: 3, name: "Level 5" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Explore Level 5" }),
    ).toHaveAttribute("href", "/level5");
  });

  it("stays a non-interactive presentation with no action provided", () => {
    render(
      <GameCard
        headingId="secret-robot-heading"
        title="Secret Robot"
        description="Secret Robot is a Sweat This game."
      />,
    );

    expect(
      screen.getByRole("heading", { level: 3, name: "Secret Robot" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders an image with meaningful alt text when provided", () => {
    render(
      <GameCard
        headingId="level5-heading"
        title="Level 5"
        description="A basketball and action game."
        image={{
          src: "/images/logo.png",
          alt: "Level 5 logo",
          width: 800,
          height: 868,
        }}
      />,
    );

    expect(
      screen.getByRole("img", { name: "Level 5 logo" }),
    ).toBeInTheDocument();
  });
});

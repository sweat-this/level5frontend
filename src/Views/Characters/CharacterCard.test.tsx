import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import CharacterCard from "./CharacterCard";

describe("CharacterCard", () => {
  it("stays a non-interactive presentation - no button/link action semantics", () => {
    render(
      <CharacterCard
        image="/images/characters/dblood.png"
        title="Dr Blood"
        name="Dr Blood"
      />,
    );

    // Activating this card does nothing (no href/onClick/navigation) - it must never expose
    // keyboard-focusable button/link semantics that promise an action that doesn't exist
    // (issue #27: the previous CardActionArea wrapper did exactly that).
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("renders the character image and name", () => {
    render(
      <CharacterCard
        image="/images/characters/dblood.png"
        title="Dr Blood"
        name="Dr Blood"
      />,
    );

    expect(screen.getByRole("img", { name: "Dr Blood" })).toHaveAttribute(
      "src",
      "/images/characters/dblood.png",
    );
    expect(screen.getByText("Dr Blood")).toBeInTheDocument();
  });
});

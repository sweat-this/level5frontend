import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import Page from "./page";

describe("app/secret-robot/world/page.tsx", () => {
  it("renders exactly one h1, naming World", () => {
    render(<Page />);

    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent("World");
  });

  it("names the approved public-safe regions", () => {
    render(<Page />);

    for (const name of [
      "Skyfall Basin",
      "Desert Wastes",
      "Red Dunes",
      "Long Straight",
      "Rust Orchard",
      "Black Pump",
      "Great Yard",
      "Glass Country",
      "White Wound",
      "Drowned Strip",
    ]) {
      expect(
        screen.getByRole("heading", { level: 3, name }),
      ).toBeInTheDocument();
    }
  });
});

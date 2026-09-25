import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import Page from "./page";

describe("app/secret-robot/characters/page.tsx", () => {
  it("renders exactly one h1, naming Characters", () => {
    render(<Page />);

    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent("Characters");
  });

  it("names the approved public-safe characters", () => {
    render(<Page />);

    for (const name of [
      "Dr. Blood",
      "Justin",
      "Sarah Young",
      "Stu",
      "Harry Charles",
      "Richard Charles",
      "Patrick & Zilla",
    ]) {
      expect(
        screen.getByRole("heading", { level: 3, name }),
      ).toBeInTheDocument();
    }
  });

  it("does not claim a settled playable/launch roster", () => {
    render(<Page />);

    expect(screen.queryByText(/playable/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/launch roster/i)).not.toBeInTheDocument();
  });
});

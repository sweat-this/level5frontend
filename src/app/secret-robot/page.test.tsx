import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import Page from "./page";

describe("app/secret-robot/page.tsx (Secret Robot hub)", () => {
  it("renders exactly one h1, naming Secret Robot", () => {
    render(<Page />);

    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent("Secret Robot");
  });

  it("links to World and Characters", () => {
    render(<Page />);

    expect(screen.getByRole("link", { name: "See World" })).toHaveAttribute(
      "href",
      "/secret-robot/world",
    );
    expect(
      screen.getByRole("link", { name: "See Characters" }),
    ).toHaveAttribute("href", "/secret-robot/characters");
  });

  it("does not present cloud saves, backups, or sync as available", () => {
    render(<Page />);

    expect(screen.queryByText(/cloud save/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/\bsync\b/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/backup/i)).not.toBeInTheDocument();
  });
});

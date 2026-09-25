import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import Page from "./page";

describe("app/page.tsx (Sweat This homepage)", () => {
  it("renders the Sweat This platform heading as the page's one h1", () => {
    render(<Page />);

    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent("Sweat This");
  });

  it("presents Level 5 with a working destination", () => {
    render(<Page />);

    expect(
      screen.getByRole("heading", { level: 3, name: "Level 5" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Explore Level 5" }),
    ).toHaveAttribute("href", "/level5");
  });

  it("presents Secret Robot without a fake or broken destination", () => {
    render(<Page />);

    expect(
      screen.getByRole("heading", { level: 3, name: "Secret Robot" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /secret robot/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /secret robot/i }),
    ).not.toBeInTheDocument();
  });

  it("provides secondary Create Account and Sign In entry points", () => {
    render(<Page />);

    expect(
      screen.getByRole("link", { name: "Create Account" }),
    ).toHaveAttribute("href", "/account/register");
    expect(screen.getByRole("link", { name: "Sign In" })).toHaveAttribute(
      "href",
      "/account/login",
    );
  });

  it("does not expose leaderboard, server-status, friends, challenges, or cloud-save UI", () => {
    render(<Page />);

    expect(screen.queryByText(/leaderboard/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/server status/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/version/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/friend/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/challenge/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/cloud save/i)).not.toBeInTheDocument();
  });
});

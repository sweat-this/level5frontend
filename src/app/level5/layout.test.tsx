import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { useQueryClient } from "@tanstack/react-query";
import Level5Layout from "./layout";
import Characters from "@/Views/Characters/Characters";

vi.mock("next/navigation", () => ({
  usePathname: () => "/level5",
}));

function ProbeNoQueryClient() {
  useQueryClient();
  return null;
}

describe("Level5Layout", () => {
  it("renders GameLocalNav instead of the retired MainNavBar - no version/server-health status chips", () => {
    render(
      <Level5Layout>
        <div>content</div>
      </Level5Layout>,
    );

    expect(
      screen.getByRole("navigation", { name: "Level 5 navigation" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Version")).not.toBeInTheDocument();
    expect(screen.queryByText(/^(Online|Offline)$/)).not.toBeInTheDocument();
  });

  it("no longer provides a QueryClient - that moved to level5/leaderboards/page.tsx (issue #23)", () => {
    expect(() =>
      render(
        <Level5Layout>
          <ProbeNoQueryClient />
        </Level5Layout>,
      ),
    ).toThrow(/No QueryClient set/);
  });

  it("renders /level5/characters content without needing a QueryClient", () => {
    expect(() =>
      render(
        <Level5Layout>
          <Characters />
        </Level5Layout>,
      ),
    ).not.toThrow();
  });

  it("primary navigation includes Modes, Characters, and Versus (issue #23)", () => {
    render(
      <Level5Layout>
        <div>content</div>
      </Level5Layout>,
    );

    expect(screen.getByRole("link", { name: "Modes" })).toHaveAttribute(
      "href",
      "/level5/modes",
    );
    expect(screen.getByRole("link", { name: "Characters" })).toHaveAttribute(
      "href",
      "/level5/characters",
    );
    expect(screen.getByRole("link", { name: "Versus" })).toHaveAttribute(
      "href",
      "/level5/versus",
    );
  });

  it("primary navigation does not include Scores, Leaderboards, or Dr Blood (issue #23)", () => {
    render(
      <Level5Layout>
        <div>content</div>
      </Level5Layout>,
    );

    expect(
      screen.queryByRole("link", { name: "Scores" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Leaderboards" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Dr Blood" }),
    ).not.toBeInTheDocument();
  });

  it("the Level 5 brand/home link still resolves to /level5", () => {
    render(
      <Level5Layout>
        <div>content</div>
      </Level5Layout>,
    );

    expect(screen.getByRole("link", { name: "Level 5" })).toHaveAttribute(
      "href",
      "/level5",
    );
  });
});

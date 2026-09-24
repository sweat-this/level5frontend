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

  it("no longer provides a QueryClient - that moved to level5/page.tsx (issue #21)", () => {
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
});

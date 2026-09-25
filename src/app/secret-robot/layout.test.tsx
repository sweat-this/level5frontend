import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import SecretRobotLayout from "./layout";

vi.mock("next/navigation", () => ({
  usePathname: () => "/secret-robot",
}));

describe("SecretRobotLayout", () => {
  it("renders a Secret Robot local nav landmark", () => {
    render(
      <SecretRobotLayout>
        <div>content</div>
      </SecretRobotLayout>,
    );

    expect(
      screen.getByRole("navigation", { name: "Secret Robot navigation" }),
    ).toBeInTheDocument();
  });

  it("links to World and Characters, and the Secret Robot home", () => {
    render(
      <SecretRobotLayout>
        <div>content</div>
      </SecretRobotLayout>,
    );

    expect(screen.getByRole("link", { name: "Secret Robot" })).toHaveAttribute(
      "href",
      "/secret-robot",
    );
    expect(screen.getByRole("link", { name: "World" })).toHaveAttribute(
      "href",
      "/secret-robot/world",
    );
    expect(screen.getByRole("link", { name: "Characters" })).toHaveAttribute(
      "href",
      "/secret-robot/characters",
    );
  });

  it("does not render a Media item - no distinct approved media exists yet", () => {
    render(
      <SecretRobotLayout>
        <div>content</div>
      </SecretRobotLayout>,
    );

    expect(screen.queryByText(/media/i)).not.toBeInTheDocument();
  });

  it("does not render a separate Overview item - Secret Robot itself is the home entry", () => {
    render(
      <SecretRobotLayout>
        <div>content</div>
      </SecretRobotLayout>,
    );

    expect(screen.queryByText(/overview/i)).not.toBeInTheDocument();
  });
});

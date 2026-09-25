import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import PlatformFooter from "./PlatformFooter";

describe("PlatformFooter", () => {
  it("renders a footer landmark", () => {
    render(<PlatformFooter />);
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
  });

  it("links to Sweat This (/), Level 5 (/level5), and Secret Robot (/secret-robot) and nothing else", () => {
    render(<PlatformFooter />);
    screen.getByRole("navigation", { name: "Footer" });
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(3);
    expect(screen.getByRole("link", { name: "Sweat This" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(screen.getByRole("link", { name: "Level 5" })).toHaveAttribute(
      "href",
      "/level5",
    );
    expect(screen.getByRole("link", { name: "Secret Robot" })).toHaveAttribute(
      "href",
      "/secret-robot",
    );
  });
});

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import SkipLink from "./SkipLink";

describe("SkipLink", () => {
  it("is an anchor that jumps to the main content landmark", () => {
    render(<SkipLink />);

    // The one semantic <main> landmark this jumps to lives outside this component (see
    // layout.tsx's #scrollableContent) - this only certifies the link itself, not the target.
    const link = screen.getByRole("link", { name: "Skip to main content" });
    expect(link).toHaveAttribute("href", "#scrollableContent");
  });

  it("is natively keyboard-focusable (a real <a href>, not a click-only element)", () => {
    render(<SkipLink />);

    const link = screen.getByRole("link", { name: "Skip to main content" });
    link.focus();

    expect(link).toHaveFocus();
  });
});

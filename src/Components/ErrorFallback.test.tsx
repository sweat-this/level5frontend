import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import ErrorFallback from "./ErrorFallback";

describe("ErrorFallback", () => {
  it("renders a fallback with a link back home", () => {
    render(<ErrorFallback />);

    expect(screen.getByText("Something went wrong.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back home" })).toHaveAttribute(
      "href",
      "/",
    );
  });

  it("shows no reference line when no digest is supplied", () => {
    render(<ErrorFallback />);
    expect(screen.queryByText(/Reference:/)).not.toBeInTheDocument();
  });

  it("shows the digest as a support reference when supplied (issue #10)", () => {
    render(<ErrorFallback digest="abc123digest" />);
    expect(screen.getByText("Reference: abc123digest")).toBeInTheDocument();
  });
});

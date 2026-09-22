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
});

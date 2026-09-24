import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
// Aliased - the default export is named "Error" (Next's error.tsx convention), which would
// otherwise shadow the global Error constructor used below to build the test fixtures.
import ErrorPage from "./error";

describe("app/error.tsx", () => {
  it("threads the error's digest through to the fallback as a support reference", () => {
    const error = Object.assign(new Error("boom"), { digest: "abc123digest" });

    render(<ErrorPage error={error} reset={vi.fn()} />);

    expect(screen.getByText("Reference: abc123digest")).toBeInTheDocument();
  });

  it("renders with no reference line when the error has no digest", () => {
    render(<ErrorPage error={new Error("boom")} reset={vi.fn()} />);

    expect(screen.queryByText(/Reference:/)).not.toBeInTheDocument();
  });
});

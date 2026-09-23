import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CopyTagButton from "./CopyTagButton";

// jsdom has no built-in Clipboard implementation, and userEvent.setup() installs its own
// always-succeeding stub onto navigator.clipboard - so the mock must be installed *after*
// userEvent.setup() runs, or userEvent's stub clobbers it.
function mockClipboardWriteText(): ReturnType<typeof vi.fn> {
  const writeTextMock = vi.fn();
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: writeTextMock },
    configurable: true,
  });
  return writeTextMock;
}

describe("CopyTagButton", () => {
  it("has an accessible button name naming the tag", () => {
    render(<CopyTagButton tag="Patrick#4827" />);
    expect(
      screen.getByRole("button", { name: "Copy player tag Patrick#4827" }),
    ).toBeInTheDocument();
  });

  it("copies the exact tag and announces success", async () => {
    const user = userEvent.setup();
    const writeTextMock = mockClipboardWriteText();
    writeTextMock.mockResolvedValue(undefined);
    render(<CopyTagButton tag="Patrick#4827" />);

    await user.click(screen.getByRole("button", { name: /Copy player tag/ }));

    expect(writeTextMock).toHaveBeenCalledWith("Patrick#4827");
    expect(await screen.findByText("Copied.")).toBeInTheDocument();
  });

  it("announces a failure when the Clipboard API rejects", async () => {
    const user = userEvent.setup();
    const writeTextMock = mockClipboardWriteText();
    writeTextMock.mockRejectedValue(new Error("denied"));
    render(<CopyTagButton tag="Patrick#4827" />);

    await user.click(screen.getByRole("button", { name: /Copy player tag/ }));

    expect(
      await screen.findByText("Couldn't copy - please copy it manually."),
    ).toBeInTheDocument();
  });
});

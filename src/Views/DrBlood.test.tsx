import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DrBlood from "./DrBlood";

// Rendering the real player would load the YouTube iframe API over the network - not something
// a unit test should depend on. This only needs to prove DrBlood swaps thumbnail -> player.
vi.mock("react-youtube", () => ({
  default: ({ videoId }: { videoId: string }) => (
    <div data-testid={`youtube-player-${videoId}`} />
  ),
}));

describe("DrBlood", () => {
  it("renders a thumbnail button per video instead of loading every player up front", () => {
    render(<DrBlood />);

    expect(
      screen.getAllByRole("button", { name: /Play video \d+ of 8/ }),
    ).toHaveLength(8);
    expect(screen.queryByTestId(/youtube-player-/)).not.toBeInTheDocument();
  });

  it("replaces only the clicked thumbnail with a real player", async () => {
    const user = userEvent.setup();
    render(<DrBlood />);

    const buttons = screen.getAllByRole("button", {
      name: /Play video \d+ of 8/,
    });
    await user.click(buttons[0]);

    expect(
      screen.getByTestId("youtube-player-TY44PEt4378"),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: /Play video \d+ of 8/ }),
    ).toHaveLength(7);
  });
});

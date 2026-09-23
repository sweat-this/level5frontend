import { describe, expect, it, vi } from "vitest";
import {
  render,
  screen,
  waitForElementToBeRemoved,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AccountFormState } from "@/lib/account/form-state";

const removeFriendActionMock = vi.fn(
  async (
    _prevState: AccountFormState,
    _formData: FormData,
  ): Promise<AccountFormState> => ({ status: "idle" }),
);

vi.mock("./actions", () => ({
  removeFriendAction: (prevState: AccountFormState, formData: FormData) =>
    removeFriendActionMock(prevState, formData),
}));

const { default: RemoveFriendButton } = await import("./RemoveFriendButton");

describe("RemoveFriendButton", () => {
  it("does not show the confirmation dialog before the button is clicked", () => {
    render(
      <RemoveFriendButton
        playerId="p1"
        displayName="Patrick"
        tag="Patrick#4827"
      />,
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(removeFriendActionMock).not.toHaveBeenCalled();
  });

  it("has an accessible trigger naming the friend to be removed", () => {
    render(
      <RemoveFriendButton
        playerId="p1"
        displayName="Patrick"
        tag="Patrick#4827"
      />,
    );

    expect(
      screen.getByRole("button", {
        name: "Remove Patrick (Patrick#4827) from friends",
      }),
    ).toBeInTheDocument();
  });

  it("opens a confirmation dialog naming the friend's display name and tag, requiring a second, explicit action", async () => {
    const user = userEvent.setup();
    render(
      <RemoveFriendButton
        playerId="p1"
        displayName="Patrick"
        tag="Patrick#4827"
      />,
    );

    await user.click(
      screen.getByRole("button", {
        name: "Remove Patrick (Patrick#4827) from friends",
      }),
    );

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Patrick");
    expect(dialog).toHaveTextContent("Patrick#4827");
    expect(removeFriendActionMock).not.toHaveBeenCalled();
  });

  it("cancelling the dialog closes it without calling the Server Action", async () => {
    const user = userEvent.setup();
    render(
      <RemoveFriendButton
        playerId="p1"
        displayName="Patrick"
        tag="Patrick#4827"
      />,
    );

    await user.click(
      screen.getByRole("button", {
        name: "Remove Patrick (Patrick#4827) from friends",
      }),
    );
    const dialog = await screen.findByRole("dialog");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    await waitForElementToBeRemoved(dialog);
    expect(removeFriendActionMock).not.toHaveBeenCalled();
  });

  it("confirming submits the playerId to removeFriendAction", async () => {
    const user = userEvent.setup();
    render(
      <RemoveFriendButton
        playerId="p1"
        displayName="Patrick"
        tag="Patrick#4827"
      />,
    );

    await user.click(
      screen.getByRole("button", {
        name: "Remove Patrick (Patrick#4827) from friends",
      }),
    );
    await screen.findByRole("dialog");
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    expect(removeFriendActionMock).toHaveBeenCalledWith(
      { status: "idle" },
      expect.any(FormData),
    );
    const [, submittedFormData] = removeFriendActionMock.mock.calls[0];
    expect(submittedFormData.get("playerId")).toBe("p1");
  });

  it("does not remove the row optimistically - it never renders removed/success text itself", () => {
    render(
      <RemoveFriendButton
        playerId="p1"
        displayName="Patrick"
        tag="Patrick#4827"
      />,
    );

    expect(screen.queryByText(/removed/i)).not.toBeInTheDocument();
  });

  it("does not show a previous attempt's error the next time the dialog is reopened", async () => {
    const user = userEvent.setup();
    removeFriendActionMock.mockResolvedValueOnce({
      status: "error",
      message: "Too many attempts. Please wait a moment and try again.",
    });
    render(
      <RemoveFriendButton
        playerId="p1"
        displayName="Patrick"
        tag="Patrick#4827"
      />,
    );

    // First attempt fails and the dialog stays open showing the error.
    await user.click(
      screen.getByRole("button", {
        name: "Remove Patrick (Patrick#4827) from friends",
      }),
    );
    await screen.findByRole("dialog");
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    const errorAlert = await screen.findByText(
      "Too many attempts. Please wait a moment and try again.",
    );

    // Close, then reopen: the stale error must not still be showing.
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitForElementToBeRemoved(errorAlert);
    await user.click(
      screen.getByRole("button", {
        name: "Remove Patrick (Patrick#4827) from friends",
      }),
    );
    await screen.findByRole("dialog");

    expect(
      screen.queryByText(
        "Too many attempts. Please wait a moment and try again.",
      ),
    ).not.toBeInTheDocument();
  });
});

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FriendRequestActionForm from "./FriendRequestActionForm";
import type { AccountFormState } from "@/lib/account/form-state";

describe("FriendRequestActionForm", () => {
  it("submits the row's requestId as a hidden field, not any acting-identity field", () => {
    const action = vi.fn(async (): Promise<AccountFormState> => ({
      status: "idle",
    }));
    const { container } = render(
      <FriendRequestActionForm
        action={action}
        requestId="req-1"
        label="Accept"
        ariaLabel="Accept friend request from Patrick#4827"
      />,
    );

    const hidden = container.querySelector(
      'input[name="requestId"]',
    ) as HTMLInputElement;
    expect(hidden.value).toBe("req-1");
    expect(container.querySelector('input[name="fromPlayerId"]')).toBeNull();
    expect(container.querySelector('input[name="actingPlayerId"]')).toBeNull();
  });

  it("uses the supplied accessible name distinct from the visible label", () => {
    render(
      <FriendRequestActionForm
        action={vi.fn()}
        requestId="req-1"
        label="Decline"
        ariaLabel="Decline friend request from Patrick#4827"
      />,
    );

    expect(
      screen.getByRole("button", {
        name: "Decline friend request from Patrick#4827",
      }),
    ).toHaveTextContent("Decline");
  });

  it("uses a real <button type=submit> so duplicate submission is prevented via useFormStatus", () => {
    render(
      <FriendRequestActionForm
        action={vi.fn()}
        requestId="req-1"
        label="Cancel Request"
        ariaLabel="Cancel friend request to Patrick#4827"
      />,
    );

    expect(
      screen.getByRole("button", {
        name: "Cancel friend request to Patrick#4827",
      }),
    ).toHaveAttribute("type", "submit");
  });

  it("renders no error before any submission", () => {
    render(
      <FriendRequestActionForm
        action={vi.fn()}
        requestId="req-1"
        label="Accept"
        ariaLabel="Accept friend request from Patrick#4827"
      />,
    );

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("renders the action's returned error message inline after a failed submission", async () => {
    const user = userEvent.setup();
    const action = vi.fn(async (): Promise<AccountFormState> => ({
      status: "error",
      message: "Too many attempts. Please wait a moment and try again.",
    }));
    render(
      <FriendRequestActionForm
        action={action}
        requestId="req-1"
        label="Accept"
        ariaLabel="Accept friend request from Patrick#4827"
      />,
    );

    await user.click(
      screen.getByRole("button", {
        name: "Accept friend request from Patrick#4827",
      }),
    );

    expect(
      await screen.findByText(
        "Too many attempts. Please wait a moment and try again.",
      ),
    ).toBeInTheDocument();
  });
});

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const sendFriendRequestActionMock = vi.fn(
  async (_prevState: { status: string }, _formData: FormData) => ({
    status: "idle" as const,
  }),
);

vi.mock("./actions", () => ({
  sendFriendRequestAction: (
    prevState: { status: string },
    formData: FormData,
  ) => sendFriendRequestActionMock(prevState, formData),
}));

const { default: SendFriendRequestForm } =
  await import("./SendFriendRequestForm");

describe("SendFriendRequestForm", () => {
  it("submits only the searched Player Tag, not a PlayerId", () => {
    const { container } = render(
      <SendFriendRequestForm tag="Patrick#4827" displayName="Patrick" />,
    );

    const hiddenTag = container.querySelector(
      'input[name="tag"]',
    ) as HTMLInputElement;
    expect(hiddenTag.value).toBe("Patrick#4827");
    expect(container.querySelector('input[name="playerId"]')).toBeNull();
    expect(container.querySelector('input[name="toPlayerId"]')).toBeNull();
  });

  it("has an accessible name identifying who the request would go to", () => {
    render(<SendFriendRequestForm tag="Patrick#4827" displayName="Patrick" />);

    expect(
      screen.getByRole("button", {
        name: "Send friend request to Patrick (Patrick#4827)",
      }),
    ).toBeInTheDocument();
  });

  it("renders no error before any submission", () => {
    render(<SendFriendRequestForm tag="Patrick#4827" displayName="Patrick" />);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

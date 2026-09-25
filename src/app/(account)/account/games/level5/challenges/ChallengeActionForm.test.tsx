import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ChallengeActionForm from "./ChallengeActionForm";
import type { AccountFormState } from "@/lib/account/form-state";

describe("ChallengeActionForm", () => {
  it("submits the row's seriesId as a hidden field, not any acting-identity field", () => {
    const action = vi.fn(async (): Promise<AccountFormState> => ({
      status: "idle",
    }));
    const { container } = render(
      <ChallengeActionForm
        action={action}
        seriesId="series-1"
        label="Accept"
        ariaLabel="Accept challenge from Patrick#4827"
      />,
    );

    const hidden = container.querySelector(
      'input[name="seriesId"]',
    ) as HTMLInputElement;
    expect(hidden.value).toBe("series-1");
    expect(container.querySelector('input[name="playerId"]')).toBeNull();
    expect(container.querySelector('input[name="actingPlayerId"]')).toBeNull();
  });

  it("uses the supplied accessible name distinct from the visible label", () => {
    render(
      <ChallengeActionForm
        action={vi.fn()}
        seriesId="series-1"
        label="Decline"
        ariaLabel="Decline challenge from Patrick#4827"
      />,
    );

    expect(
      screen.getByRole("button", {
        name: "Decline challenge from Patrick#4827",
      }),
    ).toHaveTextContent("Decline");
  });

  it("uses a real <button type=submit> so duplicate submission is prevented via useFormStatus", () => {
    render(
      <ChallengeActionForm
        action={vi.fn()}
        seriesId="series-1"
        label="Cancel"
        ariaLabel="Cancel challenge to Patrick#4827"
      />,
    );

    expect(
      screen.getByRole("button", { name: "Cancel challenge to Patrick#4827" }),
    ).toHaveAttribute("type", "submit");
  });

  it("renders no error before any submission", () => {
    render(
      <ChallengeActionForm
        action={vi.fn()}
        seriesId="series-1"
        label="Accept"
        ariaLabel="Accept challenge from Patrick#4827"
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
      <ChallengeActionForm
        action={action}
        seriesId="series-1"
        label="Accept"
        ariaLabel="Accept challenge from Patrick#4827"
      />,
    );

    await user.click(
      screen.getByRole("button", {
        name: "Accept challenge from Patrick#4827",
      }),
    );

    expect(
      await screen.findByText(
        "Too many attempts. Please wait a moment and try again.",
      ),
    ).toBeInTheDocument();
  });
});

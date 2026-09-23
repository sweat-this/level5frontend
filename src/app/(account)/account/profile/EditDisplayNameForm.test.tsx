import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import EditDisplayNameForm from "./EditDisplayNameForm";

describe("EditDisplayNameForm", () => {
  it("renders the current display name as the field's initial value", () => {
    render(<EditDisplayNameForm initialDisplayName="Current Name" />);
    const field = screen.getByLabelText(/^Display Name/) as HTMLInputElement;
    expect(field.value).toBe("Current Name");
  });

  it("declares the required/max-32 constraints (issue #6 remediation convention)", () => {
    render(<EditDisplayNameForm initialDisplayName="Current Name" />);
    const field = screen.getByLabelText(/^Display Name/) as HTMLInputElement;
    expect(field.required).toBe(true);
    expect(field.maxLength).toBe(32);
  });

  it("uses a real <button type=submit> so duplicate submission is prevented via useFormStatus", () => {
    render(<EditDisplayNameForm initialDisplayName="Current Name" />);
    const button = screen.getByRole("button", { name: "Save" });
    expect(button).toHaveAttribute("type", "submit");
  });

  it("renders no status text before any submission", () => {
    render(<EditDisplayNameForm initialDisplayName="Current Name" />);
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("");
  });
});

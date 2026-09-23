import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import RegisterForm from "./RegisterForm";

// Regression coverage for issue #6 remediation: the form previously combined declared
// constraints (required/minLength/maxLength/pattern) with a `noValidate` <form>, which disabled
// native browser constraint validation entirely. See LoginForm.test.tsx for login's equivalent.
//
// jsdom's constraint-validation support doesn't extend to minLength/maxLength's tooShort/tooLong
// validity states, so those are asserted as plain element properties here rather than through
// checkValidity() - required (valueMissing) and pattern (patternMismatch), which jsdom does
// implement, are exercised directly.
describe("RegisterForm", () => {
  it("does not disable native constraint validation", () => {
    const { container } = render(<RegisterForm returnTo="/account" />);
    const form = container.querySelector("form");
    expect(form).not.toBeNull();
    expect(form!.noValidate).toBe(false);
  });

  it("keeps keyboard submission working (a real <button type=submit> in the form)", () => {
    render(<RegisterForm returnTo="/account" />);
    const button = screen.getByRole("button", { name: "Create account" });
    expect(button).toHaveAttribute("type", "submit");
  });

  it("declares and enforces the username constraints (required, 3-32 chars, [A-Za-z0-9_.])", () => {
    render(<RegisterForm returnTo="/account" />);
    const username = screen.getByLabelText(/^Username/) as HTMLInputElement;

    expect(username.required).toBe(true);
    expect(username.minLength).toBe(3);
    expect(username.maxLength).toBe(32);
    expect(username.pattern).toBe("[A-Za-z0-9_.]{3,32}");

    expect(username.checkValidity()).toBe(false);
    expect(username.validity.valueMissing).toBe(true);

    username.value = "bad name!";
    expect(username.checkValidity()).toBe(false);
    expect(username.validity.patternMismatch).toBe(true);

    username.value = "valid_user.name";
    expect(username.checkValidity()).toBe(true);
  });

  it("declares and enforces the display-name constraint (required, max 32)", () => {
    render(<RegisterForm returnTo="/account" />);
    const displayName = screen.getByLabelText(
      /^Display Name/,
    ) as HTMLInputElement;

    expect(displayName.required).toBe(true);
    expect(displayName.maxLength).toBe(32);

    expect(displayName.checkValidity()).toBe(false);
    expect(displayName.validity.valueMissing).toBe(true);

    displayName.value = "Valid Display Name";
    expect(displayName.checkValidity()).toBe(true);
  });

  it("declares and enforces the password constraints (required, 8-128 chars)", () => {
    render(<RegisterForm returnTo="/account" />);
    const password = screen.getByLabelText(/^Password/) as HTMLInputElement;

    expect(password.required).toBe(true);
    expect(password.minLength).toBe(8);
    expect(password.maxLength).toBe(128);

    expect(password.checkValidity()).toBe(false);
    expect(password.validity.valueMissing).toBe(true);

    password.value = "longenoughpassword";
    expect(password.checkValidity()).toBe(true);
  });

  it("keeps the alert status region correctly associated for screen readers", () => {
    render(<RegisterForm returnTo="/account" />);
    const status = screen.getByRole("alert");
    expect(status).toHaveAttribute("id", "register-form-status");
    const username = screen.getByLabelText(/^Username/);
    expect(username).toHaveAttribute(
      "aria-describedby",
      "register-form-status",
    );
  });
});

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import LoginForm from "./LoginForm";

// Regression coverage for issue #6 remediation: the form previously combined declared
// constraints (required/minLength/maxLength) with a `noValidate` <form>, which disabled native
// browser constraint validation entirely - the constraints were present in the DOM but never
// actually enforced. See RegisterForm.test.tsx for the registration form's equivalent coverage.
//
// jsdom's constraint-validation support doesn't extend to minLength/maxLength's tooShort/tooLong
// validity states, so those are asserted as plain element properties here rather than through
// checkValidity() - required (valueMissing), which jsdom does implement, is exercised directly.
describe("LoginForm", () => {
  it("does not disable native constraint validation", () => {
    const { container } = render(<LoginForm returnTo="/account" />);
    const form = container.querySelector("form");
    expect(form).not.toBeNull();
    expect(form!.noValidate).toBe(false);
  });

  it("keeps keyboard submission working (a real <button type=submit> in the form)", () => {
    render(<LoginForm returnTo="/account" />);
    const button = screen.getByRole("button", { name: "Log in" });
    expect(button).toHaveAttribute("type", "submit");
  });

  it("declares and enforces the username constraints (required, 3-32 chars)", () => {
    render(<LoginForm returnTo="/account" />);
    const username = screen.getByLabelText(/^Username/) as HTMLInputElement;

    expect(username.required).toBe(true);
    expect(username.minLength).toBe(3);
    expect(username.maxLength).toBe(32);

    expect(username.checkValidity()).toBe(false);
    expect(username.validity.valueMissing).toBe(true);

    username.value = "validuser";
    expect(username.checkValidity()).toBe(true);
  });

  it("declares and enforces the password constraints (required, 8-128 chars)", () => {
    render(<LoginForm returnTo="/account" />);
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
    render(<LoginForm returnTo="/account" />);
    const status = screen.getByRole("alert");
    expect(status).toHaveAttribute("id", "login-form-status");
    const username = screen.getByLabelText(/^Username/);
    expect(username).toHaveAttribute("aria-describedby", "login-form-status");
  });
});

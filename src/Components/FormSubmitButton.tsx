"use client";

import { useFormStatus } from "react-dom";
import { Button, type ButtonProps } from "@mui/material";

/**
 * Shared pending/disabled submit button for the account forms (login, register, logout) - one
 * useFormStatus() consumer instead of three. Must be a Client Component descendant of the
 * <form> it reports on; the form itself can stay a plain server-rendered element.
 */
export default function FormSubmitButton({
  children,
  ...buttonProps
}: ButtonProps) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending} {...buttonProps}>
      {pending ? "Please wait…" : children}
    </Button>
  );
}

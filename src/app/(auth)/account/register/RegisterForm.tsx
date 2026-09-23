"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Alert, Stack, TextField, Typography } from "@mui/material";
import FormSubmitButton from "@/Components/FormSubmitButton";
import { initialAccountFormState } from "@/lib/account/form-state";
import { registerAction } from "./actions";

const STATUS_ID = "register-form-status";
const USERNAME_PATTERN = "[A-Za-z0-9_.]{3,32}";

export default function RegisterForm({
  returnTo,
}: {
  readonly returnTo: string;
}) {
  const [state, formAction] = useActionState(
    registerAction,
    initialAccountFormState,
  );
  const hasError = state.status === "error";

  return (
    <Stack component="form" action={formAction} spacing={3} noValidate>
      <Typography variant="h4" component="h1">
        Create account
      </Typography>

      <div id={STATUS_ID} role="alert">
        {hasError && <Alert severity="error">{state.message}</Alert>}
      </div>

      <input type="hidden" name="returnTo" value={returnTo} />

      <TextField
        id="register-username"
        name="username"
        label="Username"
        autoComplete="username"
        required
        fullWidth
        error={hasError}
        helperText="3-32 characters: letters, digits, underscore, or period."
        slotProps={{
          htmlInput: {
            minLength: 3,
            maxLength: 32,
            pattern: USERNAME_PATTERN,
            "aria-invalid": hasError,
            "aria-describedby": STATUS_ID,
          },
        }}
      />
      <TextField
        id="register-display-name"
        name="displayName"
        label="Display Name"
        autoComplete="nickname"
        required
        fullWidth
        error={hasError}
        slotProps={{
          htmlInput: {
            maxLength: 32,
            "aria-invalid": hasError,
            "aria-describedby": STATUS_ID,
          },
        }}
      />
      <TextField
        id="register-password"
        name="password"
        type="password"
        label="Password"
        autoComplete="new-password"
        required
        fullWidth
        error={hasError}
        helperText="8-128 characters."
        slotProps={{
          htmlInput: {
            minLength: 8,
            maxLength: 128,
            "aria-invalid": hasError,
            "aria-describedby": STATUS_ID,
          },
        }}
      />

      <FormSubmitButton variant="contained" fullWidth>
        Create account
      </FormSubmitButton>

      <Typography variant="body2">
        Already have an account? <Link href="/account/login">Log in</Link>
      </Typography>
    </Stack>
  );
}

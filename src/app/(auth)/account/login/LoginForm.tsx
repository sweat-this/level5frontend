"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Alert, Stack, TextField, Typography } from "@mui/material";
import FormSubmitButton from "@/Components/FormSubmitButton";
import { initialAccountFormState } from "@/lib/account/form-state";
import { loginAction } from "./actions";

const STATUS_ID = "login-form-status";

export default function LoginForm({ returnTo }: { readonly returnTo: string }) {
  const [state, formAction] = useActionState(
    loginAction,
    initialAccountFormState,
  );
  const hasError = state.status === "error";

  return (
    <Stack component="form" action={formAction} spacing={3} noValidate>
      <Typography variant="h4" component="h1">
        Log in
      </Typography>

      <div id={STATUS_ID} role="alert">
        {hasError && <Alert severity="error">{state.message}</Alert>}
      </div>

      <input type="hidden" name="returnTo" value={returnTo} />

      <TextField
        id="login-username"
        name="username"
        label="Username"
        autoComplete="username"
        required
        fullWidth
        error={hasError}
        slotProps={{
          htmlInput: {
            minLength: 3,
            maxLength: 32,
            "aria-invalid": hasError,
            "aria-describedby": STATUS_ID,
          },
        }}
      />
      <TextField
        id="login-password"
        name="password"
        type="password"
        label="Password"
        autoComplete="current-password"
        required
        fullWidth
        error={hasError}
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
        Log in
      </FormSubmitButton>

      <Typography variant="body2">
        Need an account? <Link href="/account/register">Create one</Link>
      </Typography>
    </Stack>
  );
}

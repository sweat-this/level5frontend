"use client";

import { useActionState } from "react";
import { Alert, Stack, TextField } from "@mui/material";
import FormSubmitButton from "@/Components/FormSubmitButton";
import { initialProfileFormState } from "@/lib/account/profile-form-state";
import { updateDisplayNameAction } from "./actions";

const STATUS_ID = "display-name-form-status";

/**
 * An uncontrolled input (`defaultValue`, never a `value` prop) - after a failed submission,
 * useActionState re-renders this component but never remounts the underlying <input>, so
 * whatever the player typed stays exactly as they left it. No extra state needed to "preserve
 * the value" on a transient failure.
 */
export default function EditDisplayNameForm({
  initialDisplayName,
}: {
  readonly initialDisplayName: string;
}) {
  const [state, formAction] = useActionState(
    updateDisplayNameAction,
    initialProfileFormState,
  );
  const hasError = state.status === "error";
  const hasSuccess = state.status === "success";

  return (
    <Stack component="form" action={formAction} spacing={2}>
      <div id={STATUS_ID} role="status" aria-live="polite">
        {hasError && <Alert severity="error">{state.message}</Alert>}
        {hasSuccess && <Alert severity="success">{state.message}</Alert>}
      </div>

      <TextField
        id="profile-display-name"
        name="displayName"
        label="Display Name"
        required
        fullWidth
        defaultValue={initialDisplayName}
        error={hasError}
        slotProps={{
          htmlInput: {
            maxLength: 32,
            "aria-invalid": hasError,
            "aria-describedby": STATUS_ID,
          },
        }}
      />

      <FormSubmitButton variant="contained" sx={{ alignSelf: "flex-start" }}>
        Save
      </FormSubmitButton>
    </Stack>
  );
}

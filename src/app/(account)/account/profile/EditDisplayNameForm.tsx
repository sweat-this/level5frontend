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
 *
 * On success, the action returns Backend V2's server-confirmed (trimmed) `displayName`
 * (issue #10). The input is keyed on that value so it remounts with the confirmed value as its
 * new `defaultValue` - the one intentional exception to "never remounts", and the only case
 * where the displayed value changes out from under the player.
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
  const confirmedDisplayName =
    hasSuccess && state.displayName ? state.displayName : undefined;
  const displayValue = confirmedDisplayName ?? initialDisplayName;

  return (
    <Stack component="form" action={formAction} spacing={2}>
      <div id={STATUS_ID} role="status" aria-live="polite">
        {hasError && <Alert severity="error">{state.message}</Alert>}
        {hasSuccess && <Alert severity="success">{state.message}</Alert>}
      </div>

      <TextField
        key={displayValue}
        id="profile-display-name"
        name="displayName"
        label="Display Name"
        required
        fullWidth
        defaultValue={displayValue}
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

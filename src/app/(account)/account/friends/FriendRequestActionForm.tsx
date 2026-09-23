"use client";

import { useActionState } from "react";
import { Alert, Stack } from "@mui/material";
import FormSubmitButton from "@/Components/FormSubmitButton";
import {
  initialAccountFormState,
  type AccountFormState,
} from "@/lib/account/form-state";

type RequestMutationAction = (
  prevState: AccountFormState,
  formData: FormData,
) => Promise<AccountFormState>;

/**
 * One row's accept/decline/cancel control (issue #8 sections 9/10) - a single small Client
 * Component shared by all three, since they're identical in shape: a hidden requestId, a submit
 * button that disables itself while its own mutation is pending (useFormStatus, scoped to this
 * row's own <form> only - see FormSubmitButton), and an inline error for the non-redirecting
 * failure cases (see friends/actions.ts's mapMutationError). Success and "stale state" outcomes
 * both redirect from the Server Action itself, so this component never needs to know about them.
 */
export default function FriendRequestActionForm({
  action,
  requestId,
  label,
  ariaLabel,
  color,
}: {
  readonly action: RequestMutationAction;
  readonly requestId: string;
  readonly label: string;
  readonly ariaLabel: string;
  readonly color?: "primary" | "error" | "inherit";
}) {
  const [state, formAction] = useActionState(action, initialAccountFormState);

  return (
    <Stack component="form" action={formAction} spacing={0.5}>
      <input type="hidden" name="requestId" value={requestId} />
      <FormSubmitButton
        size="small"
        variant="outlined"
        color={color}
        aria-label={ariaLabel}
        sx={{ alignSelf: "flex-start" }}
      >
        {label}
      </FormSubmitButton>
      {state.status === "error" && (
        <Alert severity="error" role="status" sx={{ py: 0 }}>
          {state.message}
        </Alert>
      )}
    </Stack>
  );
}

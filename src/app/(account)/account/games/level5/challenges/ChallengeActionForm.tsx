"use client";

import { useActionState } from "react";
import { Alert, Stack } from "@mui/material";
import FormSubmitButton from "@/Components/FormSubmitButton";
import {
  initialAccountFormState,
  type AccountFormState,
} from "@/lib/account/form-state";

type ChallengeMutationAction = (
  prevState: AccountFormState,
  formData: FormData,
) => Promise<AccountFormState>;

/**
 * One row's Accept/Decline/Cancel control (issue #9's "Mutation Placement"/"Duplicate
 * Submission") - mirrors friends/FriendRequestActionForm.tsx: a hidden seriesId, a submit button
 * that disables itself while its own row's mutation is pending (useFormStatus, scoped to this
 * <form> only), and an inline error for the one non-redirecting failure case (429/400 - see
 * challenges/actions.ts's mapMutationError). Success, stale-state, and ambiguous-outcome all
 * redirect from the Server Action itself, so this component never needs to know about them, and
 * no optimistic status change is ever rendered here.
 */
export default function ChallengeActionForm({
  action,
  seriesId,
  label,
  ariaLabel,
  color,
}: {
  readonly action: ChallengeMutationAction;
  readonly seriesId: string;
  readonly label: string;
  readonly ariaLabel: string;
  readonly color?: "primary" | "error" | "inherit";
}) {
  const [state, formAction] = useActionState(action, initialAccountFormState);

  return (
    <Stack component="form" action={formAction} spacing={0.5}>
      <input type="hidden" name="seriesId" value={seriesId} />
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

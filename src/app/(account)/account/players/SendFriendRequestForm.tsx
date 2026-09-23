"use client";

import { useActionState } from "react";
import { Alert, Stack } from "@mui/material";
import FormSubmitButton from "@/Components/FormSubmitButton";
import { initialAccountFormState } from "@/lib/account/form-state";
import { sendFriendRequestAction } from "./actions";

const STATUS_ID = "send-friend-request-status";

/**
 * A small Client Component island so a failed send-request leaves the search result visible
 * (issue #8 section 14) instead of navigating away. Submits only the searched Player Tag - the
 * server re-resolves it to a PlayerId itself (see actions.ts) rather than trusting one from here.
 */
export default function SendFriendRequestForm({
  tag,
  displayName,
}: {
  readonly tag: string;
  readonly displayName: string;
}) {
  const [state, formAction] = useActionState(
    sendFriendRequestAction,
    initialAccountFormState,
  );
  const hasError = state.status === "error";

  return (
    <Stack
      component="form"
      action={formAction}
      spacing={1}
      sx={{ alignItems: "flex-start" }}
    >
      <input type="hidden" name="tag" value={tag} />
      <div id={STATUS_ID} role="status" aria-live="polite">
        {hasError && <Alert severity="error">{state.message}</Alert>}
      </div>
      <FormSubmitButton
        variant="contained"
        aria-label={`Send friend request to ${displayName} (${tag})`}
        aria-describedby={STATUS_ID}
      >
        Send Friend Request
      </FormSubmitButton>
    </Stack>
  );
}

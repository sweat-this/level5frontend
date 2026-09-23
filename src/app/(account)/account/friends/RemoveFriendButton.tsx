"use client";

import { useActionState, useId, useState } from "react";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Stack,
} from "@mui/material";
import FormSubmitButton from "@/Components/FormSubmitButton";
import { initialAccountFormState } from "@/lib/account/form-state";
import { removeFriendAction } from "./actions";

/**
 * Owns the confirm submission's useActionState, split out from RemoveFriendButton so it can be
 * remounted (via `key`, see RemoveFriendButton's confirmAttempt) each time the dialog opens.
 * Without that, a previous failed attempt's error would still render the instant the dialog is
 * reopened later, before any new submission.
 */
function RemoveFriendConfirmForm({
  playerId,
  onCancel,
}: {
  readonly playerId: string;
  readonly onCancel: () => void;
}) {
  const [state, formAction] = useActionState(
    removeFriendAction,
    initialAccountFormState,
  );

  return (
    <Stack spacing={1.5} sx={{ width: "100%" }}>
      {state.status === "error" && (
        <Alert severity="error" role="status">
          {state.message}
        </Alert>
      )}
      <Stack direction="row" spacing={1} sx={{ justifyContent: "flex-end" }}>
        <Button onClick={onCancel}>Cancel</Button>
        <form action={formAction}>
          <input type="hidden" name="playerId" value={playerId} />
          <FormSubmitButton color="error" variant="contained">
            Confirm
          </FormSubmitButton>
        </form>
      </Stack>
    </Stack>
  );
}

/**
 * Remove Friend requires deliberate confirmation (issue #8 section 18) - the row's button only
 * opens a dialog; the actual mutation is a separate submit inside it. MUI's Dialog already
 * traps and restores focus and closes on Escape, satisfying section 26's accessibility
 * requirements without any custom focus management here. Never removes the row optimistically -
 * on success the Server Action redirects to a fresh authoritative read (see friends/actions.ts).
 */
export default function RemoveFriendButton({
  playerId,
  displayName,
  tag,
}: {
  readonly playerId: string;
  readonly displayName: string;
  readonly tag: string;
}) {
  const [open, setOpen] = useState(false);
  // Bumped on every open so RemoveFriendConfirmForm's `key` remounts it - each open starts from a
  // clean useActionState, so a previous attempt's error never reappears on reopen.
  const [confirmAttempt, setConfirmAttempt] = useState(0);
  const titleId = useId();

  function openDialog(): void {
    setConfirmAttempt((attempt) => attempt + 1);
    setOpen(true);
  }

  return (
    <>
      <Button
        variant="outlined"
        color="error"
        size="small"
        onClick={openDialog}
        aria-label={`Remove ${displayName} (${tag}) from friends`}
      >
        Remove Friend
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        aria-labelledby={titleId}
      >
        <DialogTitle id={titleId}>Remove friend?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Remove {displayName} ({tag}) from your friends? This can&apos;t be
            undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ display: "block" }}>
          <RemoveFriendConfirmForm
            key={confirmAttempt}
            playerId={playerId}
            onCancel={() => setOpen(false)}
          />
        </DialogActions>
      </Dialog>
    </>
  );
}

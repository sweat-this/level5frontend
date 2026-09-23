// Shared useActionState shape for the profile-editing forms (issue #7) - mirrors
// AccountFormState (form-state.ts) but adds "success", since an edit (unlike login/register,
// which navigate away on success) re-renders the same form in place. Carries no "server-only"
// tag - imported by both Client Components (the forms) and their Server Action modules.
export interface ProfileFormState {
  readonly status: "idle" | "error" | "success";
  readonly message?: string;
}

export const initialProfileFormState: ProfileFormState = { status: "idle" };

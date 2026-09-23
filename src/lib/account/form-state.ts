// Shared useActionState shape for the login/register forms. Imported by both Client Components
// (the forms) and their Server Action modules, so it deliberately carries no "server-only" tag.
export interface AccountFormState {
  readonly status: "idle" | "error";
  readonly message?: string;
}

export const initialAccountFormState: AccountFormState = { status: "idle" };

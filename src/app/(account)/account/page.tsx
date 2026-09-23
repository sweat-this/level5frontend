import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Alert, Stack, Typography } from "@mui/material";
import FormSubmitButton from "@/Components/FormSubmitButton";
import { resolveCurrentAccountSession } from "@/lib/account/session-resolution";
import { logoutAction } from "./actions";

export const metadata: Metadata = {
  title: "Sweat This - Account",
  description: "Your Sweat This account.",
};

function formatMemberSince(createdAt: string): string {
  const parsed = new Date(createdAt);
  if (Number.isNaN(parsed.getTime())) {
    return createdAt;
  }
  return parsed.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default async function AccountPage() {
  const result = await resolveCurrentAccountSession();

  if (result.kind === "unauthenticated") {
    redirect("/account/login?returnTo=/account");
  }

  if (result.kind === "unavailable") {
    return (
      <Stack spacing={2}>
        <Typography variant="h4" component="h1">
          Account
        </Typography>
        <Alert severity="warning" role="status">
          Your account isn&apos;t available right now. Please try again shortly.
        </Alert>
      </Stack>
    );
  }

  if (result.kind === "throttled") {
    return (
      <Stack spacing={2}>
        <Typography variant="h4" component="h1">
          Account
        </Typography>
        <Alert severity="warning" role="status">
          Too many attempts. Please wait a moment and try again.
        </Alert>
      </Stack>
    );
  }

  const { account } = result;

  return (
    <Stack spacing={3}>
      <Typography variant="h4" component="h1">
        Account
      </Typography>

      <Stack spacing={1} component="dl" sx={{ margin: 0 }}>
        <Stack direction="row" spacing={1}>
          <Typography component="dt" sx={{ fontWeight: "bold", margin: 0 }}>
            Username:
          </Typography>
          <Typography component="dd" sx={{ margin: 0 }}>
            {account.username}
          </Typography>
        </Stack>
        <Stack direction="row" spacing={1}>
          <Typography component="dt" sx={{ fontWeight: "bold", margin: 0 }}>
            Account Status:
          </Typography>
          <Typography component="dd" sx={{ margin: 0 }}>
            {account.status}
          </Typography>
        </Stack>
        <Stack direction="row" spacing={1}>
          <Typography component="dt" sx={{ fontWeight: "bold", margin: 0 }}>
            Member Since:
          </Typography>
          <Typography component="dd" sx={{ margin: 0 }}>
            {formatMemberSince(account.createdAt)}
          </Typography>
        </Stack>
      </Stack>

      <form action={logoutAction}>
        <FormSubmitButton variant="outlined">Log out</FormSubmitButton>
      </form>
    </Stack>
  );
}

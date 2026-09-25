import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Alert, Stack, Typography } from "@mui/material";
import { resolveCurrentAccountSession } from "@/lib/account/session-resolution";

export const metadata: Metadata = {
  title: "Sweat This - Level 5",
  description: "Your Level 5 account data.",
};

const LEVEL5_GAME_PATH = "/account/games/level5";
const LOGIN_REDIRECT = `/account/login?returnTo=${LEVEL5_GAME_PATH}`;

function PageHeading() {
  return (
    <Typography variant="h4" component="h1">
      Level 5
    </Typography>
  );
}

function UnavailablePage({ message }: { readonly message: string }) {
  return (
    <Stack spacing={2}>
      <PageHeading />
      <Alert severity="warning" role="status">
        {message}
      </Alert>
    </Stack>
  );
}

/**
 * Level 5's game-data entry point (issue #25) - the parent account layout sets `dynamic =
 * "force-dynamic"` but is not itself an auth guard (it only renders shared nav/chrome), so this
 * page resolves the account session directly, the same as every other authenticated account
 * page. Deliberately does not fetch challenge lists (that stays owned by /account/challenges,
 * migrating to a namespaced URL under this page in issue #26) - this page only links to it.
 */
export default async function Level5GameDataPage() {
  const sessionResult = await resolveCurrentAccountSession();

  if (sessionResult.kind === "unauthenticated") {
    redirect(LOGIN_REDIRECT);
  }
  if (sessionResult.kind === "unavailable") {
    return (
      <UnavailablePage message="Your account isn't available right now. Please try again shortly." />
    );
  }
  if (sessionResult.kind === "throttled") {
    return (
      <UnavailablePage message="Too many attempts. Please wait a moment and try again." />
    );
  }

  return (
    <Stack spacing={4}>
      <PageHeading />
      <Typography color="text.secondary">Game-specific account data</Typography>

      <Stack
        component="section"
        spacing={0.5}
        aria-labelledby="challenges-heading"
        sx={{
          padding: 2,
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 1,
        }}
      >
        <Typography id="challenges-heading" variant="h6" component="h2">
          <Link href="/account/challenges">Challenges</Link>
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Manage incoming, outgoing, active, and completed correspondence
          series.
        </Typography>
      </Stack>

      <Typography>
        <Link href="/level5">View Level 5</Link>
      </Typography>
    </Stack>
  );
}

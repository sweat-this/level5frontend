import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Alert, Stack, Typography } from "@mui/material";
import FormSubmitButton from "@/Components/FormSubmitButton";
import { resolveCurrentAccountSession } from "@/lib/account/session-resolution";
import { logoutAction } from "./actions";
import CopyTagButton from "./profile/CopyTagButton";
import { ACCOUNT_LOGIN_REDIRECT, resolveIdentitySection } from "./reads";

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

function PageHeading() {
  return (
    <Typography variant="h4" component="h1">
      Account
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
 * One task-oriented entry within Social/Games (issue #25) - shared layout only, never a generic
 * registry: every caller passes its own fixed href/copy, so adding a game later is one more
 * explicit call, not a data-driven list.
 */
function DashboardLinkCard({
  href,
  title,
  description,
}: {
  readonly href: string;
  readonly title: string;
  readonly description: string;
}) {
  return (
    <Stack
      spacing={0.5}
      sx={{
        padding: 2,
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 1,
      }}
    >
      <Typography sx={{ fontWeight: "bold" }}>
        <Link href={href}>{title}</Link>
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {description}
      </Typography>
    </Stack>
  );
}

export default async function AccountPage() {
  const sessionResult = await resolveCurrentAccountSession();

  if (sessionResult.kind === "unauthenticated") {
    redirect(ACCOUNT_LOGIN_REDIRECT);
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

  const { account } = sessionResult;

  // Independent of the account session above (issue #25's "Profile Failure Isolation") - a
  // temporary profile-read failure degrades Identity to a warning without hiding the rest of the
  // dashboard, which needs only the account session already resolved.
  const identity = await resolveIdentitySection();

  if (identity.kind === "redirect") {
    redirect(ACCOUNT_LOGIN_REDIRECT);
  }

  return (
    <Stack spacing={5}>
      <PageHeading />

      <Stack component="section" spacing={2} aria-labelledby="identity-heading">
        <Typography id="identity-heading" variant="h5" component="h2">
          Identity
        </Typography>
        {identity.kind === "message" ? (
          <Alert severity="warning" role="status">
            {identity.message}
          </Alert>
        ) : (
          <Stack spacing={1}>
            <Typography variant="h6" component="p">
              {identity.displayName}
            </Typography>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
              <Typography color="text.secondary">{identity.tag}</Typography>
              <CopyTagButton tag={identity.tag} />
            </Stack>
            <Typography>
              <Link href="/account/profile">Edit Profile</Link>
            </Typography>
          </Stack>
        )}
      </Stack>

      <Stack component="section" spacing={2} aria-labelledby="social-heading">
        <Typography id="social-heading" variant="h5" component="h2">
          Social
        </Typography>
        <Stack spacing={2}>
          <DashboardLinkCard
            href="/account/friends"
            title="Friends"
            description="Manage friends and friend requests."
          />
          <DashboardLinkCard
            href="/account/players"
            title="Find Player"
            description="Search for players by Player Tag."
          />
        </Stack>
      </Stack>

      <Stack component="section" spacing={2} aria-labelledby="games-heading">
        <Typography id="games-heading" variant="h5" component="h2">
          Games
        </Typography>
        <DashboardLinkCard
          href="/account/games/level5"
          title="Level 5"
          description="Challenges and correspondence"
        />
      </Stack>

      <Stack component="section" spacing={1} aria-labelledby="details-heading">
        <Typography id="details-heading" variant="h5" component="h2">
          Account details
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
      </Stack>

      <form action={logoutAction}>
        <FormSubmitButton variant="outlined">Log out</FormSubmitButton>
      </form>
    </Stack>
  );
}

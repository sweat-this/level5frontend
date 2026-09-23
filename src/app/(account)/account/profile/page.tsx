import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Alert, Stack, Typography } from "@mui/material";
import { resolveAuthenticatedBackendAccess } from "@/lib/account/backend-access";
import { PROFILE_UNAVAILABLE_MESSAGE } from "@/lib/account/outcome-messages";
import * as PlayersApi from "@/lib/backend-v2/resources/players";
import CopyTagButton from "./CopyTagButton";
import EditDisplayNameForm from "./EditDisplayNameForm";

export const metadata: Metadata = {
  title: "Sweat This - Profile",
  description: "Your Sweat This player profile.",
};

const PROFILE_PATH = "/account/profile";
const LOGIN_REDIRECT = `/account/login?returnTo=${PROFILE_PATH}`;

function UnavailableNotice({ message }: { readonly message: string }) {
  return (
    <Stack spacing={2}>
      <Typography variant="h4" component="h1">
        Profile
      </Typography>
      <Alert severity="warning" role="status">
        {message}
      </Alert>
    </Stack>
  );
}

export default async function ProfilePage() {
  const access = await resolveAuthenticatedBackendAccess();

  if (access.kind === "unauthenticated") {
    redirect(LOGIN_REDIRECT);
  }
  if (access.kind === "unavailable") {
    return <UnavailableNotice message={PROFILE_UNAVAILABLE_MESSAGE} />;
  }
  if (access.kind === "throttled") {
    return (
      <UnavailableNotice message="Too many attempts. Please wait a moment and try again." />
    );
  }

  const result = await PlayersApi.getMyProfile(access.accessToken);

  if (result.kind === "error") {
    if (result.error.kind === "http" && result.error.httpStatus === 401) {
      redirect(LOGIN_REDIRECT);
    }
    if (result.error.kind === "http" && result.error.httpStatus === 404) {
      // Account/profile creation is atomic (see issue #7's non-goals) - a missing own profile
      // here is unexpected, not a normal "create your profile" state, so there's no repair UX.
      return <UnavailableNotice message={PROFILE_UNAVAILABLE_MESSAGE} />;
    }
    return <UnavailableNotice message={PROFILE_UNAVAILABLE_MESSAGE} />;
  }

  const { displayName, tag } = result.data;

  return (
    <Stack spacing={4}>
      <Stack spacing={3}>
        <Typography variant="h4" component="h1">
          Profile
        </Typography>

        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <Typography sx={{ fontWeight: "bold" }}>Player Tag:</Typography>
          <Typography>{tag}</Typography>
          <CopyTagButton tag={tag} />
        </Stack>
      </Stack>

      <EditDisplayNameForm initialDisplayName={displayName} />
    </Stack>
  );
}

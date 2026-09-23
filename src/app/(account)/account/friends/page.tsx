import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Alert, Stack, Typography } from "@mui/material";
import { resolveAuthenticatedBackendAccess } from "@/lib/account/backend-access";
import {
  TEMPORARY_UNAVAILABLE_MESSAGE,
  THROTTLED_MESSAGE,
} from "@/lib/account/outcome-messages";
import type {
  FriendRequestListItem,
  FriendSummary,
} from "@/lib/backend-v2/contracts";
import * as FriendsApi from "@/lib/backend-v2/resources/friends";
import {
  acceptFriendRequestAction,
  cancelFriendRequestAction,
  declineFriendRequestAction,
} from "./actions";
import FriendRequestActionForm from "./FriendRequestActionForm";
import { resolveFriendNotice } from "./notices";
import RemoveFriendButton from "./RemoveFriendButton";
import {
  hasResourceAuthFailure,
  toSectionResult,
  type SocialSectionResult,
} from "./reads";

export const metadata: Metadata = {
  title: "Sweat This - Friends",
  description:
    "Your Sweat This friends, and incoming and outgoing friend requests.",
};

const FRIENDS_PATH = "/account/friends";
const LOGIN_REDIRECT = `/account/login?returnTo=${FRIENDS_PATH}`;

function formatFriendsSince(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
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
      Friends
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

function SectionMessage({ message }: { readonly message: string }) {
  return (
    <Alert severity="warning" role="status">
      {message}
    </Alert>
  );
}

function FriendsList({
  result,
}: {
  readonly result: SocialSectionResult<FriendSummary>;
}) {
  if (result.kind === "message") {
    return <SectionMessage message={result.message} />;
  }
  if (result.items.length === 0) {
    return (
      <Typography color="text.secondary">
        You don&apos;t have any friends yet.
      </Typography>
    );
  }
  return (
    <Stack
      component="ul"
      spacing={2}
      sx={{ margin: 0, padding: 0, listStyle: "none" }}
    >
      {result.items.map((friend) => (
        <Stack
          key={friend.playerId}
          component="li"
          direction="row"
          spacing={2}
          sx={{ alignItems: "center", justifyContent: "space-between" }}
        >
          <Stack spacing={0.5}>
            <Typography sx={{ fontWeight: "bold" }}>
              {friend.displayName}{" "}
              <Typography component="span" color="text.secondary">
                {friend.tag}
              </Typography>
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Friends since {formatFriendsSince(friend.friendsSince)}
            </Typography>
          </Stack>
          <RemoveFriendButton
            playerId={friend.playerId}
            displayName={friend.displayName}
            tag={friend.tag}
          />
        </Stack>
      ))}
    </Stack>
  );
}

function IncomingRequestsList({
  result,
}: {
  readonly result: SocialSectionResult<FriendRequestListItem>;
}) {
  if (result.kind === "message") {
    return <SectionMessage message={result.message} />;
  }
  if (result.items.length === 0) {
    return (
      <Typography color="text.secondary">
        No incoming friend requests.
      </Typography>
    );
  }
  return (
    <Stack
      component="ul"
      spacing={2}
      sx={{ margin: 0, padding: 0, listStyle: "none" }}
    >
      {result.items.map((item) => (
        <Stack
          key={item.id}
          component="li"
          direction="row"
          spacing={2}
          sx={{ alignItems: "center", justifyContent: "space-between" }}
        >
          <Typography>
            {item.otherPlayer.displayName}{" "}
            <Typography component="span" color="text.secondary">
              {item.otherPlayer.tag}
            </Typography>
          </Typography>
          <Stack direction="row" spacing={1}>
            <FriendRequestActionForm
              action={acceptFriendRequestAction}
              requestId={item.id}
              label="Accept"
              ariaLabel={`Accept friend request from ${item.otherPlayer.tag}`}
            />
            <FriendRequestActionForm
              action={declineFriendRequestAction}
              requestId={item.id}
              label="Decline"
              ariaLabel={`Decline friend request from ${item.otherPlayer.tag}`}
              color="error"
            />
          </Stack>
        </Stack>
      ))}
    </Stack>
  );
}

function OutgoingRequestsList({
  result,
}: {
  readonly result: SocialSectionResult<FriendRequestListItem>;
}) {
  if (result.kind === "message") {
    return <SectionMessage message={result.message} />;
  }
  if (result.items.length === 0) {
    return (
      <Typography color="text.secondary">
        No outgoing friend requests.
      </Typography>
    );
  }
  return (
    <Stack
      component="ul"
      spacing={2}
      sx={{ margin: 0, padding: 0, listStyle: "none" }}
    >
      {result.items.map((item) => (
        <Stack
          key={item.id}
          component="li"
          direction="row"
          spacing={2}
          sx={{ alignItems: "center", justifyContent: "space-between" }}
        >
          <Typography>
            {item.otherPlayer.displayName}{" "}
            <Typography component="span" color="text.secondary">
              {item.otherPlayer.tag}
            </Typography>
          </Typography>
          <FriendRequestActionForm
            action={cancelFriendRequestAction}
            requestId={item.id}
            label="Cancel Request"
            ariaLabel={`Cancel friend request to ${item.otherPlayer.tag}`}
            color="error"
          />
        </Stack>
      ))}
    </Stack>
  );
}

export default async function FriendsPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ readonly notice?: string }>;
}) {
  const access = await resolveAuthenticatedBackendAccess();

  if (access.kind === "unauthenticated") {
    redirect(LOGIN_REDIRECT);
  }
  if (access.kind === "unavailable") {
    return <UnavailablePage message={TEMPORARY_UNAVAILABLE_MESSAGE} />;
  }
  if (access.kind === "throttled") {
    return <UnavailablePage message={THROTTLED_MESSAGE} />;
  }

  // Three independent reads, issued together (issue #8 section 6) - each renders its own
  // section's empty/data/error state below rather than one failure discarding the others.
  const [friendsResult, incomingResult, outgoingResult] = await Promise.all([
    FriendsApi.listFriends(access.accessToken),
    FriendsApi.listIncoming(access.accessToken),
    FriendsApi.listOutgoing(access.accessToken),
  ]);

  if (hasResourceAuthFailure(friendsResult, incomingResult, outgoingResult)) {
    redirect(LOGIN_REDIRECT);
  }

  const { notice } = await searchParams;
  const noticeView = resolveFriendNotice(notice);

  const friends = toSectionResult(friendsResult);
  const incoming = toSectionResult(incomingResult);
  const outgoing = toSectionResult(outgoingResult);

  return (
    <Stack spacing={5}>
      <PageHeading />

      {noticeView && (
        <Alert severity={noticeView.severity} role="status">
          {noticeView.message}
        </Alert>
      )}

      <Stack component="section" spacing={2} aria-labelledby="friends-heading">
        <Typography id="friends-heading" variant="h5" component="h2">
          Friends
        </Typography>
        <FriendsList result={friends} />
      </Stack>

      <Stack component="section" spacing={2} aria-labelledby="incoming-heading">
        <Typography id="incoming-heading" variant="h5" component="h2">
          Incoming Requests
        </Typography>
        <IncomingRequestsList result={incoming} />
      </Stack>

      <Stack component="section" spacing={2} aria-labelledby="outgoing-heading">
        <Typography id="outgoing-heading" variant="h5" component="h2">
          Outgoing Requests
        </Typography>
        <OutgoingRequestsList result={outgoing} />
      </Stack>

      <Stack
        component="section"
        spacing={1}
        aria-labelledby="find-player-heading"
      >
        <Typography id="find-player-heading" variant="h5" component="h2">
          Find Player
        </Typography>
        <Typography>
          <Link href="/account/players">Search for a player by Player Tag</Link>{" "}
          to send a friend request.
        </Typography>
      </Stack>
    </Stack>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Alert, Stack, Typography } from "@mui/material";
import { resolveAuthenticatedBackendAccess } from "@/lib/account/backend-access";
import {
  TEMPORARY_UNAVAILABLE_MESSAGE,
  THROTTLED_MESSAGE,
} from "@/lib/account/outcome-messages";
import type { SeriesSummary } from "@/lib/backend-v2/contracts";
import ChallengeActionForm from "./ChallengeActionForm";
import {
  acceptChallengeAction,
  cancelChallengeAction,
  declineChallengeAction,
} from "./actions";
import { resolveChallengeNotice } from "./notices";
import {
  CHALLENGES_LOGIN_REDIRECT,
  resolveChallengesList,
  type ChallengesListResult,
} from "./reads";
import {
  CHALLENGES_PATH,
  challengeDetailPath,
  firstQueryValue,
  normalizeCursor,
  normalizeView,
  type ChallengesView,
  type RawQueryValue,
} from "./view";

export const metadata: Metadata = {
  title: "Sweat This - Challenges",
  description:
    "Your incoming and outgoing challenges, and active and completed series.",
};

const VIEW_TABS: readonly {
  readonly view: ChallengesView;
  readonly label: string;
}[] = [
  { view: "incoming", label: "Incoming" },
  { view: "outgoing", label: "Outgoing" },
  { view: "active", label: "Active" },
  { view: "completed", label: "Completed" },
  { view: "history", label: "History" },
];

const EMPTY_MESSAGES: Readonly<Record<ChallengesView, string>> = {
  incoming: "No incoming challenges.",
  outgoing: "No outgoing challenges.",
  active: "No active series.",
  completed: "No completed series.",
  history: "No challenge history yet.",
};

// Changing category always drops any existing cursor (issue #9's "view change removes cursor").
function pageHref(view: ChallengesView, cursor?: string): string {
  const params = new URLSearchParams({ view });
  if (cursor) {
    params.set("cursor", cursor);
  }
  return `${CHALLENGES_PATH}?${params.toString()}`;
}

function formatDate(value: string): string {
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
      Challenges
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

function CategoryNav({ current }: { readonly current: ChallengesView }) {
  return (
    <Stack
      component="nav"
      aria-label="Challenge category"
      direction="row"
      spacing={3}
    >
      {VIEW_TABS.map((tab) => (
        <Link
          key={tab.view}
          href={pageHref(tab.view)}
          aria-current={tab.view === current ? "page" : undefined}
          style={tab.view === current ? { fontWeight: "bold" } : undefined}
        >
          {tab.label}
        </Link>
      ))}
    </Stack>
  );
}

function RowIdentity({
  displayName,
  tag,
}: {
  readonly displayName: string;
  readonly tag: string;
}) {
  return (
    <Typography sx={{ fontWeight: "bold" }}>
      {displayName}{" "}
      <Typography component="span" color="text.secondary">
        {tag}
      </Typography>
    </Typography>
  );
}

function ParticipantsLine({ series }: { readonly series: SeriesSummary }) {
  return (
    <Typography variant="body2">
      Challenger: {series.challenger.displayName} ({series.challenger.tag})
      {" · "}
      Opponent: {series.opponent.displayName} ({series.opponent.tag})
    </Typography>
  );
}

function IncomingRow({ series }: { readonly series: SeriesSummary }) {
  return (
    <Stack component="li" spacing={1} sx={{ listStyle: "none" }}>
      <RowIdentity
        displayName={series.challenger.displayName}
        tag={series.challenger.tag}
      />
      <Typography variant="body2" color="text.secondary">
        Best of {series.totalGames} · {series.status} · Created{" "}
        {formatDate(series.createdAt)}
      </Typography>
      <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start" }}>
        <ChallengeActionForm
          action={acceptChallengeAction}
          seriesId={series.id}
          label="Accept"
          ariaLabel={`Accept challenge from ${series.challenger.tag}`}
        />
        <ChallengeActionForm
          action={declineChallengeAction}
          seriesId={series.id}
          label="Decline"
          ariaLabel={`Decline challenge from ${series.challenger.tag}`}
          color="error"
        />
        <Link
          href={challengeDetailPath(series.id)}
          aria-label={`View details for challenge from ${series.challenger.tag}`}
        >
          View Details
        </Link>
      </Stack>
    </Stack>
  );
}

function OutgoingRow({ series }: { readonly series: SeriesSummary }) {
  return (
    <Stack component="li" spacing={1} sx={{ listStyle: "none" }}>
      <RowIdentity
        displayName={series.opponent.displayName}
        tag={series.opponent.tag}
      />
      <Typography variant="body2" color="text.secondary">
        Best of {series.totalGames} · {series.status} · Created{" "}
        {formatDate(series.createdAt)}
      </Typography>
      <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start" }}>
        <ChallengeActionForm
          action={cancelChallengeAction}
          seriesId={series.id}
          label="Cancel"
          ariaLabel={`Cancel challenge to ${series.opponent.tag}`}
          color="error"
        />
        <Link
          href={challengeDetailPath(series.id)}
          aria-label={`View details for challenge to ${series.opponent.tag}`}
        >
          View Details
        </Link>
      </Stack>
    </Stack>
  );
}

function ActiveRow({ series }: { readonly series: SeriesSummary }) {
  return (
    <Stack component="li" spacing={1} sx={{ listStyle: "none" }}>
      <ParticipantsLine series={series} />
      <Typography variant="body2" color="text.secondary">
        {series.status} · Game {series.currentGameNumber} of {series.totalGames}{" "}
        (Best of {series.totalGames}) · Created {formatDate(series.createdAt)}
      </Typography>
      <Link
        href={challengeDetailPath(series.id)}
        aria-label={`View details for active series between ${series.challenger.tag} and ${series.opponent.tag}`}
      >
        View Details
      </Link>
    </Stack>
  );
}

function CompletedRow({ series }: { readonly series: SeriesSummary }) {
  return (
    <Stack component="li" spacing={1} sx={{ listStyle: "none" }}>
      <ParticipantsLine series={series} />
      <Typography variant="body2" color="text.secondary">
        Best of {series.totalGames} · {series.status} · Created{" "}
        {formatDate(series.createdAt)}
      </Typography>
      <Link
        href={challengeDetailPath(series.id)}
        aria-label={`View details for completed series between ${series.challenger.tag} and ${series.opponent.tag}`}
      >
        View Details
      </Link>
    </Stack>
  );
}

function HistoryRow({ series }: { readonly series: SeriesSummary }) {
  return (
    <Stack component="li" spacing={1} sx={{ listStyle: "none" }}>
      <ParticipantsLine series={series} />
      <Typography variant="body2" color="text.secondary">
        {series.status} · Best of {series.totalGames} · Created{" "}
        {formatDate(series.createdAt)}
      </Typography>
      <Link
        href={challengeDetailPath(series.id)}
        aria-label={`View details for ${series.status.toLowerCase()} series between ${series.challenger.tag} and ${series.opponent.tag}`}
      >
        View Details
      </Link>
    </Stack>
  );
}

function ChallengesListSection({
  view,
  result,
}: {
  readonly view: ChallengesView;
  readonly result: ChallengesListResult;
}) {
  if (result.kind === "message") {
    return (
      <Alert severity="warning" role="status">
        {result.message}
      </Alert>
    );
  }
  if (result.kind === "invalid-cursor") {
    return (
      <Stack spacing={1}>
        <Alert severity="warning" role="status">
          That page couldn&apos;t be loaded. Please start from the first page.
        </Alert>
        <Link href={pageHref(view)}>Back to first page</Link>
      </Stack>
    );
  }
  if (result.kind !== "data") {
    // "redirect" is handled by the page component before this ever renders.
    return null;
  }

  if (result.items.length === 0) {
    return (
      <Typography color="text.secondary">{EMPTY_MESSAGES[view]}</Typography>
    );
  }

  return (
    <Stack
      component="ul"
      spacing={2}
      sx={{ margin: 0, padding: 0, listStyle: "none" }}
    >
      {result.items.map((series) => {
        switch (view) {
          case "incoming":
            return <IncomingRow key={series.id} series={series} />;
          case "outgoing":
            return <OutgoingRow key={series.id} series={series} />;
          case "active":
            return <ActiveRow key={series.id} series={series} />;
          case "completed":
            return <CompletedRow key={series.id} series={series} />;
          case "history":
            return <HistoryRow key={series.id} series={series} />;
        }
      })}
    </Stack>
  );
}

export default async function ChallengesPage({
  searchParams,
}: {
  readonly searchParams: Promise<{
    readonly view?: RawQueryValue;
    readonly cursor?: RawQueryValue;
    readonly notice?: RawQueryValue;
  }>;
}) {
  const access = await resolveAuthenticatedBackendAccess();

  if (access.kind === "unauthenticated") {
    redirect(CHALLENGES_LOGIN_REDIRECT);
  }
  if (access.kind === "unavailable") {
    return <UnavailablePage message={TEMPORARY_UNAVAILABLE_MESSAGE} />;
  }
  if (access.kind === "throttled") {
    return <UnavailablePage message={THROTTLED_MESSAGE} />;
  }

  const params = await searchParams;
  const view = normalizeView(params.view);
  const cursor = normalizeCursor(params.cursor);
  const notice = resolveChallengeNotice(firstQueryValue(params.notice));

  const result = await resolveChallengesList(view, cursor, access.accessToken);

  if (result.kind === "redirect") {
    redirect(result.path);
  }

  return (
    <Stack spacing={4}>
      <PageHeading />

      {notice && (
        <Alert severity={notice.severity} role="status">
          {notice.message}
        </Alert>
      )}

      <CategoryNav current={view} />

      <ChallengesListSection view={view} result={result} />

      {result.kind === "data" && (
        <Stack direction="row" spacing={2}>
          {cursor && <Link href={pageHref(view)}>Back to first page</Link>}
          {result.nextCursor && (
            <Link href={pageHref(view, result.nextCursor)}>Next page</Link>
          )}
        </Stack>
      )}
    </Stack>
  );
}

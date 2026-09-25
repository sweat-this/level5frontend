import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Alert, Divider, Stack, Typography } from "@mui/material";
import type { SeriesDetails } from "@/lib/backend-v2/contracts";
import { resolveSeriesDetail } from "./reads";
import { hasWinner, resolveWinnerLabel } from "./winner";

export const metadata: Metadata = {
  title: "Sweat This - Challenge Details",
  description: "Details for a Sweat This correspondence challenge or series.",
};

type SeriesGame = SeriesDetails["games"][number];
type SeriesAttempt = SeriesGame["yourAttempt"];

/**
 * Defensive widening only, never a behavior change (issue #9's "Do Not Reconstruct" boundary):
 * Backend V2's domain leaves an attempt null until both sides of a round have completed (see
 * GameRoundView.OpponentAttempt in the backend), but the generated OpenAPI contract doesn't mark
 * yourAttempt/opponentAttempt nullable - a contract-generation gap, not a Backend behavior this
 * page relies on. Widening the type here means a genuinely-null wire value renders "Not started"
 * instead of throwing, without touching the shared generated contract or Backend V2.
 */
function widenAttempt(
  attempt: SeriesAttempt,
): SeriesAttempt | null | undefined {
  return attempt;
}

function formatDateTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function Row({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) {
  return (
    <Stack direction="row" spacing={1}>
      <Typography component="dt" sx={{ fontWeight: "bold", margin: 0 }}>
        {label}:
      </Typography>
      <Typography component="dd" sx={{ margin: 0 }}>
        {value}
      </Typography>
    </Stack>
  );
}

function ParticipantsSection({ series }: { readonly series: SeriesDetails }) {
  return (
    <Stack spacing={0.5} component="dl" sx={{ margin: 0 }}>
      <Row
        label="Challenger"
        value={`${series.challenger.displayName} (${series.challenger.tag})`}
      />
      <Row
        label="Opponent"
        value={`${series.opponent.displayName} (${series.opponent.tag})`}
      />
    </Stack>
  );
}

function SeriesInfoSection({ series }: { readonly series: SeriesDetails }) {
  return (
    <Stack spacing={0.5} component="dl" sx={{ margin: 0 }}>
      <Row label="Status" value={series.status} />
      <Row
        label="Format"
        value={`Best of ${series.totalGames} (first to ${series.gamesToWin})`}
      />
      <Row label="Current Game" value={String(series.currentGameNumber)} />
      <Row label="Created" value={formatDateTime(series.createdAt)} />
      {series.completedAt !== null && (
        <Row label="Ended" value={formatDateTime(series.completedAt)} />
      )}
      {hasWinner(series) && (
        <Row label="Winner" value={resolveWinnerLabel(series)} />
      )}
    </Stack>
  );
}

function RulesSection({ series }: { readonly series: SeriesDetails }) {
  const rules = series.rules;
  return (
    <Stack spacing={0.5} component="dl" sx={{ margin: 0 }}>
      <Row label="Ruleset ID" value={rules.rulesetId} />
      <Row label="Ruleset Version" value={String(rules.rulesetVersion)} />
      <Row label="Mode ID" value={rules.modeId} />
      <Row label="Information Policy" value={rules.informationPolicy} />
      <Row
        label="Alternates First Attempt"
        value={rules.alternatesFirstAttempt ? "Yes" : "No"}
      />
      <Row
        label="Comparison Keys"
        value={
          rules.comparisonKeys.length > 0
            ? rules.comparisonKeys
                .map((key) => `${key.metric} (${key.direction})`)
                .join(", ")
            : "None"
        }
      />
    </Stack>
  );
}

/**
 * Sealed / partial result safety (issue #9, strict): a null result renders exactly "Result not
 * available" - never inferred, calculated, or fetched from elsewhere. Backend V2's projection is
 * the sole disclosure authority for what appears here.
 */
function AttemptCard({
  label,
  attempt,
}: {
  readonly label: string;
  readonly attempt: SeriesAttempt;
}) {
  const value = widenAttempt(attempt);
  if (!value) {
    return (
      <Stack spacing={0.25} sx={{ flex: 1 }}>
        <Typography variant="body2" sx={{ fontWeight: "bold" }}>
          {label}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Not started
        </Typography>
      </Stack>
    );
  }
  return (
    <Stack spacing={0.25} sx={{ flex: 1 }}>
      <Typography variant="body2" sx={{ fontWeight: "bold" }}>
        {label}
      </Typography>
      <Typography variant="body2">Status: {value.status}</Typography>
      {value.result ? (
        <Stack component="ul" sx={{ margin: 0, paddingLeft: 2 }}>
          {Object.entries(value.result).map(([metric, metricValue]) => (
            <Typography key={metric} component="li" variant="body2">
              {metric}: {metricValue}
            </Typography>
          ))}
        </Stack>
      ) : (
        <Typography variant="body2" color="text.secondary">
          Result not available
        </Typography>
      )}
    </Stack>
  );
}

function GamesSection({ games }: { readonly games: readonly SeriesGame[] }) {
  if (games.length === 0) {
    return (
      <Typography color="text.secondary">No games have started yet.</Typography>
    );
  }
  return (
    <Stack spacing={2}>
      {games.map((game) => (
        <Stack key={game.gameNumber} spacing={1}>
          <Typography variant="subtitle1" component="h3">
            Game {game.gameNumber}
          </Typography>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={3}>
            <AttemptCard label="Your Attempt" attempt={game.yourAttempt} />
            <AttemptCard
              label="Opponent Attempt"
              attempt={game.opponentAttempt}
            />
          </Stack>
        </Stack>
      ))}
    </Stack>
  );
}

function UnavailableDetail({ message }: { readonly message: string }) {
  return (
    <Stack spacing={2}>
      <Typography variant="h4" component="h1">
        Challenge Details
      </Typography>
      <Alert severity="warning" role="status">
        {message}
      </Alert>
    </Stack>
  );
}

export default async function ChallengeDetailPage({
  params,
}: {
  readonly params: Promise<{ readonly seriesId: string }>;
}) {
  const { seriesId } = await params;
  const outcome = await resolveSeriesDetail(seriesId);

  if (outcome.kind === "redirect") {
    redirect(outcome.path);
  }
  if (outcome.kind === "message") {
    return <UnavailableDetail message={outcome.message} />;
  }

  const { series } = outcome;

  return (
    <Stack spacing={4}>
      <Typography variant="h4" component="h1">
        Challenge Details
      </Typography>

      <Stack
        component="section"
        spacing={2}
        aria-labelledby="participants-heading"
      >
        <Typography id="participants-heading" variant="h5" component="h2">
          Participants
        </Typography>
        <ParticipantsSection series={series} />
      </Stack>

      <Divider />

      <Stack component="section" spacing={2} aria-labelledby="series-heading">
        <Typography id="series-heading" variant="h5" component="h2">
          Series
        </Typography>
        <SeriesInfoSection series={series} />
      </Stack>

      <Divider />

      <Stack component="section" spacing={2} aria-labelledby="rules-heading">
        <Typography id="rules-heading" variant="h5" component="h2">
          Rules
        </Typography>
        <RulesSection series={series} />
      </Stack>

      <Divider />

      <Stack component="section" spacing={2} aria-labelledby="games-heading">
        <Typography id="games-heading" variant="h5" component="h2">
          Games
        </Typography>
        <GamesSection games={series.games} />
      </Stack>
    </Stack>
  );
}

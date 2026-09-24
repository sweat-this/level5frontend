/**
 * Test-only Backend V2 seeding for the correspondence-portal E2E suite (issue #9's "E2E Fixture
 * Constraint"). Calls Backend V2's own existing production HTTP API directly over `fetch`,
 * bypassing the Next.js app entirely - never through a frontend product code path, since issue #9
 * deliberately never adds Create Challenge / StartAttempt / CompleteAttempt to the web portal (see
 * src/lib/backend-v2/resources/series.ts's header comment). "score-only" is the one entry in
 * Backend V2's real StaticRulesetCatalog (v2/src/Level5.Infrastructure/Competition/
 * StaticRulesetCatalog.cs) - the same ruleset Unity already exercises, not a value invented for
 * this test suite.
 *
 * Lives only under e2e/ - nothing in src/ ever imports this module, so it can never reach the
 * production frontend bundle.
 */

const BACKEND_BASE_URL =
  process.env.LEVEL5_E2E_BACKEND_BASE_URL ?? "http://localhost:5053";

interface AccessTokenResponse {
  readonly accessToken: string;
  readonly playerId: string;
}

export interface SeededPlayer {
  readonly accessToken: string;
  readonly playerId: string;
}

async function postJson<T>(path: string, body: unknown, accessToken?: string): Promise<T> {
  const response = await fetch(`${BACKEND_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `Backend V2 fixture setup failed: POST ${path} -> ${response.status} ${text}`,
    );
  }
  // Accept/decline/cancel return 204 No Content - never call .json() on an empty body.
  return (text ? JSON.parse(text) : undefined) as T;
}

/** Backend V2's own login - used only to recover an access token + player id for an account the
 * test already registered through the web UI (see e2e/challenges.spec.ts). */
export async function loginDirect(
  username: string,
  password: string,
): Promise<SeededPlayer> {
  const data = await postJson<AccessTokenResponse>("/api/v2/auth/login", {
    username,
    password,
  });
  return { accessToken: data.accessToken, playerId: data.playerId };
}

interface FriendRequestResponse {
  readonly id: string;
}

/**
 * Backend V2 only allows challenging an accepted friend (`friendship_required`, discovered by
 * exercising the real API while writing this fixture - CreateChallenge's contract requires it,
 * even though nothing in issue #9 exercises Create Challenge itself). Uses the existing Friends
 * API directly for the same reason as everything else in this file: fixture setup only, never
 * through frontend product code. Exported for suites (e.g. accessibility.spec.ts's Remove Friend
 * dialog test) that need an established friendship but no challenge on top of it.
 */
export async function seedFriendship(a: SeededPlayer, b: SeededPlayer): Promise<void> {
  const request = await postJson<FriendRequestResponse>(
    "/api/v2/friends/requests",
    { toPlayerId: b.playerId },
    a.accessToken,
  );
  await postJson(
    `/api/v2/friends/requests/${request.id}/accept`,
    {},
    b.accessToken,
  );
}

export interface SeededSeries {
  readonly id: string;
}

/**
 * Creates a pending challenge from `challenger` to `opponent` (issue #9 fixture), first
 * establishing the friendship Backend V2 requires before CreateChallenge will accept it.
 */
export async function seedChallenge(
  challenger: SeededPlayer,
  opponent: SeededPlayer,
  totalGames = 1,
): Promise<SeededSeries> {
  await seedFriendship(challenger, opponent);
  return postJson<SeededSeries>(
    "/api/v2/series",
    {
      opponentId: opponent.playerId,
      totalGames,
      rulesetId: "score-only",
      clientRequestId: crypto.randomUUID(),
    },
    challenger.accessToken,
  );
}

/**
 * Accepts a pending challenge directly against Backend V2 (fixture setup only - the web portal's
 * own Accept flow is covered separately by driving the real UI in e2e/challenges.spec.ts).
 */
export async function acceptDirect(
  opponent: SeededPlayer,
  seriesId: string,
): Promise<void> {
  await postJson(`/api/v2/series/${seriesId}/accept`, {}, opponent.accessToken);
}

export interface AttemptDescriptor {
  readonly attemptId: string;
}

export async function startAttempt(
  player: SeededPlayer,
  seriesId: string,
  gameNumber: number,
): Promise<AttemptDescriptor> {
  return postJson<AttemptDescriptor>(
    `/api/v2/series/${seriesId}/games/${gameNumber}/attempts/start`,
    {},
    player.accessToken,
  );
}

export async function completeAttempt(
  player: SeededPlayer,
  seriesId: string,
  gameNumber: number,
  attemptId: string,
  score: number,
): Promise<void> {
  await postJson(
    `/api/v2/series/${seriesId}/games/${gameNumber}/attempts/${attemptId}/complete`,
    { metrics: { Score: score } },
    player.accessToken,
  );
}

/**
 * Plays out game 1 for both sides of an already-accepted, best-of-1 series so it reaches
 * Completed with a deterministic winner (issue #9's "Completed-Series Certification"). Calls
 * Backend V2's own StartAttempt/CompleteAttempt endpoints directly, exactly like the (Unity-only)
 * production client would - the web portal itself never exposes these (issue #9's "No Browser
 * Gameplay"). `score-only`'s single comparison key is Score/HigherWins, so `winner` is whichever
 * side is given the higher score.
 */
export async function seedCompletedSeries(
  seriesId: string,
  winner: SeededPlayer,
  loser: SeededPlayer,
): Promise<void> {
  const winnerAttempt = await startAttempt(winner, seriesId, 1);
  await completeAttempt(winner, seriesId, 1, winnerAttempt.attemptId, 10);

  const loserAttempt = await startAttempt(loser, seriesId, 1);
  await completeAttempt(loser, seriesId, 1, loserAttempt.attemptId, 5);
}

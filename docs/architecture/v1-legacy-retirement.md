# Legacy V1 Public Integration Retirement (issue #29)

Status: Blocked for full retirement. Dead-code cleanup done; the active V1 leaderboard path is
intentionally retained. This document is the retirement gate record - re-audit it (and re-run the
searches below) before touching `/level5/leaderboards` or `src/lib/backend-v1-public/*` again.

## Audited baseline

```text
level5frontend  dev @ 979d36524ab38d4e8b589550cc7c681e017000a9
Level5Backend   dev @ 8613c05359e4a2d7cc81a2c8779a4378121157e6
level5 (Unity)  dev @ 1b8aca97eaaa67ae646e1f0f0a8843386a291f01
```

## What this document is not

This is not a retirement of the V1 integration. `/level5/leaderboards` still serves its data from
the legacy backend. Nothing here should be read as "V1 is retired" - see
[Gate status](#gate-status) for why it remains blocked.

## Remaining V1 runtime surface

One route, one dependency chain, unchanged from the last audit:

```text
/level5/leaderboards
  -> QueryProvider (src/lib/query/QueryProvider.tsx)
  -> ScoresTable (src/Components/ScoresTable.tsx)
  -> useHighscores (src/lib/backend-v1-public/hooks/useHighscores.ts)
  -> httpClient (src/lib/backend-v1-public/httpClient.ts)
  -> NEXT_PUBLIC_LEGACY_API_BASE_URL
  -> legacy GET /api/highscores
```

Isolation, verified against the current tree:

- `/level5/leaderboards` is directly addressable but absent from `LEVEL5_NAV_ITEMS`
  (`src/app/level5/layout.tsx`) - the layout's own comment says leaderboards "stay unadvertised
  until a hosted production results path exists," which is exactly this gate.
- `proxy.ts`'s `LEGACY_API_ROUTES` grants the legacy-API CSP `connect-src` origin to that one
  pathname only; every other route gets no legacy origin at all.
- A repo-wide search for `useHighscores`, `backend-v1-public`, and
  `NEXT_PUBLIC_LEGACY_API_BASE_URL` turns up no consumer outside this chain (plus `proxy.ts`/
  `proxy.test.ts`/`headers.ts`, which implement the CSP scoping itself).

Every file/package this chain depends on
(`src/app/level5/leaderboards/page.tsx`, `ScoresTable.tsx`, `highscoreColumns.ts`,
`backend-v1-public/{httpClient,types}.ts`, `useHighscores.ts`, `QueryProvider.tsx`,
`@tanstack/react-query`, `@mui/x-data-grid`, `NEXT_PUBLIC_LEGACY_API_BASE_URL`, the
route-scoped legacy CSP allowance) is retained as-is.

## Dead code removed this pass

`useCurrentVersion.ts` and `useServerHealth.ts` (`src/lib/backend-v1-public/hooks/`) had zero
consumers anywhere in the repository (verified by grep for the hook names, the endpoints they
called - `/api/application/version/current`, `/health` - and for any stale doc/test reference to
either). Deleted outright; no platform-global V1 health/version polling exists anywhere in the
frontend. `types.ts` (`Highscore`/`Summary`) was left in place - `useHighscores` still depends on
it.

## V2 replacement capability (exists, not usable yet)

Backend V2 (`Level5Backend` dev) already has the leaderboard read and match-result write paths:

```text
POST /api/v2/match-results          (Level5.Api/Controllers/MatchResultsController.cs)
GET  /api/v2/leaderboards/{modeId}  (Level5.Api/Controllers/LeaderboardsController.cs)
```

Unity (`level5` dev) already has the forward submission pipeline: an ordinary completed match
goes through `BackendV2MatchResultAdapter` into a durable `PendingMatchResultStore`, which POSTs
to `/api/v2/match-results` and retries across process restarts - but only for results queued under
a valid Backend V2 player session at match completion. Pre-existing unauthenticated/local scores
do not backfill.

The frontend's pinned OpenAPI snapshot (`src/generated/level5-v2.ts`) already contains both
contracts. None of this is rebuilt or duplicated by this issue.

## Gate status

### Gate A - hosted Backend V2: BLOCKED

`Level5Backend/v2/README.md`'s own Status section states plainly: "no hosting provider, PostgreSQL
instance, or staging/production environment has been selected or provisioned by this repository."
The repo has a deployment *image* and a migration *bundle* (issue #42) - a packaging capability,
not a hosted endpoint. There is no staging/production V2 URL for any client to reach. This is the
single decisive blocker; every other gate is secondary while this one holds.

### Gate B - public vs. authenticated leaderboard access: BLOCKED (undecided)

`LeaderboardsController` and `MatchResultsController` are both `[Authorize]` - V2 has no anonymous
leaderboard-read contract today. `/level5/leaderboards` is currently public/anonymous. No product
decision has been made to (a) add an intentionally anonymous safe V2 read contract, (b) migrate the
route to authenticated BFF access, or (c) remove the capability. Do not resolve this by silently
proxying the authenticated endpoint with a hidden service credential, and do not silently require
login for a page that is public today.

### Gate C - supported-board discovery: BLOCKED (not built)

Backend V2's controllers are `AccountController`, `AuthController`, `FriendsController`,
`LeaderboardsController`, `MatchResultsController`, `PlayersController`, `SeriesController` - no
discovery endpoint exists for "which mode ids have boards, with what ranking metric/direction."
`StaticLeaderboardPolicyCatalog` is server-internal only. A production web client needs an
authoritative way to enumerate supported boards; probing mode ids and reading 400s is not
discovery and must not be built as a substitute.

### Gate D - historical data: DECIDED (fresh start, no migration)

Resolved explicitly by the product, not inferred: PR #44 (legacy account migration /
V1->V2 identity mapping) was merged and then fully reverted in PR #46; issue #45 (historical V1
high-score migration, which depended on #44) was closed with the comment "historical V1
high-score data won't be migrated into V2 after all." No `legacy_account_links` or
`legacy_match_result_links` table exists on `dev`. Outcome: V1 `Highscores` history is not carried
into V2 - V2 leaderboards start fresh from `match_results`. There is no separate archival plan for
V1 history beyond the existing V1 database itself; this document does not invent one. Do not
manufacture V2 `PlayerId`s from legacy usernames/user IDs - the mechanism that would have done that
no longer exists.

### Gate E - real submission-to-read certification: BLOCKED (transitively, by Gate A)

There is no hosted environment to certify a real
`Unity match -> V2 match-results -> persisted row -> V2 leaderboard read -> web-visible row` path
against. Unit/integration test coverage of the Unity submission pipeline and the Backend V2
leaderboard query exists independently, but per the issue's own instruction this cannot substitute
for the final retirement decision.

## Exact conditions required before V1 deletion

All of the following, in this order, with evidence recorded here (not inferred from code):

1. A real staging/production Backend V2 URL exists and is reachable by the frontend/Unity clients
   (closes Gate A).
2. An explicit product decision on public-vs-authenticated V2 leaderboard access is made and
   implemented (closes Gate B).
3. Backend V2 ships a supported-board discovery contract the web client can call (closes Gate C).
4. (Already satisfied - see Gate D.)
5. A real end-to-end run against the hosted environment from (1) - an actual Unity match, a real
   V2 player session, a persisted `match_results` row, a V2 leaderboard read, and the expected
   row rendered on the web - is performed and its result recorded here.

Only once all five hold does issue #29's "V2-native leaderboard implementation, remove remaining
V1 dependencies" scope become in-scope. Until then, the work in this issue is limited to what
[section 7 of the issue](https://github.com/sweat-this/level5frontend/issues/29) calls "safe
cleanup" - which is what this pass did.

# Legacy V1 Public Integration Retirement (issue #29)

Status: Blocked for full retirement. Dead-code cleanup done; the active V1 leaderboard path is
intentionally retained. This document is the retirement gate record - re-audit it (and re-run the
searches below) before touching `/level5/leaderboards` or `src/lib/backend-v1-public/*` again.

## Audited baseline

```text
level5frontend  dev @ 6f62f09142c8a97624fac9f817dbedbdc1addf2b
Level5Backend   dev @ 5c8961a673a5ad7eb5e10719f1a2561180a540d1
level5 (Unity)  dev @ d90e5e0bc800338db270762a213074ed2107163d
```

These are the fetched `origin/dev` tips audited on 2026-10-02, not cached local assumptions. There
were no open pull requests in any of the three repositories at the time of the audit, so there was
no pending leaderboard, result, authentication, or deployment change to reconcile with these tips.

### Re-audit for issue #29 (2026-10-02)

Every gate fact below was re-checked against the SHAs above. Backend advanced from the issue's prior
`a37aad0` reference only through PR #49's result/leaderboard trust-contract documentation; the V2
controllers and policy/discovery surface did not change. The only frontend V1 runtime chain is still
the one listed under [Remaining V1 runtime surface](#remaining-v1-runtime-surface). Unity's V1
remote score/leaderboard transport remains retired and its online leaderboard UI still reads V2.
None of the repository changes closes a retirement gate.

Current repository V1 surface:

- **Frontend:** the public `/level5/leaderboards` chain below is the only active V1 browser runtime
  dependency. The old V1 current-version/server-health hooks remain deleted; the frontend's own
  `/health/live` and `/health/ready` routes are unrelated platform probes.
- **Backend:** anonymous V1 high-score reads, including `GET /api/highscores`, remain available for
  the retained frontend. V1 score `POST`, `PUT`, `DELETE`, and `POST unsubmitted` mutations return
  `410 Gone` with `legacy_score_transport_retired`.
- **Unity:** no production V1 remote score/leaderboard calls remain. The retirement regression test
  rejects the old `APIHelper` score methods and production endpoint constants. Two localhost-only
  high-score constants remain unused; unrelated V1 runtime calls for application version, server
  messages, and user reports remain outside this issue's score/leaderboard scope.

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

Unity's online stats path is also already cut over to V2:

```text
StatsManager
  -> OnlineLeaderboardFilterTranslator
  -> OnlineLeaderboardPaginationState
  -> BackendV2Runtime.Leaderboards / ILeaderboardsApiClient
  -> LeaderboardsApiClient
  -> GET /api/v2/leaderboards/{modeId}
  -> LeaderboardEntryPresentationMapper
```

The client passes Backend-provided cursors through opaquely and does not duplicate the server's
mode-to-metric or ranking-direction policy.

The frontend's pinned OpenAPI snapshot (`src/generated/level5-v2.ts`) already contains both
contracts. None of this is rebuilt or duplicated by this issue.

## Gate status

### Gate A - hosted Backend V2: BLOCKED

`Level5Backend/v2/README.md`'s own Status section states plainly: "no hosting provider, PostgreSQL
instance, or staging/production environment has been selected or provisioned by this repository."
The repo has a deployment *image* and a migration *bundle* (Backend PR #42) - a packaging capability,
not a hosted endpoint. Current GitHub repository metadata also reports zero deployments, zero
environments, and no repository-level Actions variables or secrets. No real Backend V2 URL or
PostgreSQL environment was supplied in issue #29 or its comments. Therefore no staging/production
V2 endpoint is available for this retirement audit to reach. This is the single decisive blocker;
every other gate is secondary while this one holds.

### Gate B - public vs. authenticated leaderboard access: BLOCKED (undecided)

`LeaderboardsController` and `MatchResultsController` are both `[Authorize]` - V2 has no anonymous
leaderboard-read contract today. `/level5/leaderboards` is currently public/anonymous. No product
decision has been made to (a) remove the web leaderboard, (b) retain it behind authenticated BFF
access, or (c) retain it as an intentionally anonymous safe V2 read. Issue #29 has no comments or
decision record; parent issue #20 and issue #23 only say to preserve the legacy route unadvertised
until hosted results exist. Do not resolve this by silently proxying the authenticated endpoint with
a hidden service credential, exposing a bearer token to browser JavaScript, or silently requiring
login for a page that is public today.

### Gate C - supported-board discovery: UNRESOLVED (conditional on Gate B)

Backend V2's controllers are `AccountController`, `AuthController`, `FriendsController`,
`LeaderboardsController`, `MatchResultsController`, `PlayersController`, `SeriesController` - no
discovery endpoint exists for "which mode ids have boards, with what ranking metric/direction."
`StaticLeaderboardPolicyCatalog` is server-internal only. A production web client needs an
authoritative way to enumerate supported boards; probing mode ids and reading 400s is not
discovery and must not be built as a substitute. If Gate B chooses a browsable multi-mode web
leaderboard, the smallest prerequisite is a read-only projection of the existing catalog. If Gate B
chooses removal, discovery is not required and must not be built for this issue.

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
for the final retirement decision. No such staging evidence is recorded in issue #29. This gate is
required only if Gate B retains a web leaderboard; an explicit removal decision would make the
replacement E2E path inapplicable.

## Known stale documentation outside this repository

`Level5Backend/v2/README.md` still contains a roadmap sentence saying leaderboards/highscores come
only after the correspondence vertical slice is proven in production, even though the same current
README and current source document and implement V2 match-result ingestion and leaderboard reads.
Current source and the canonical V2 result/leaderboard trust contract are authoritative. This
frontend gate-record update does not edit unrelated Backend documentation.

## Exact conditions required before V1 deletion

All applicable conditions below, in this order, with evidence recorded here (not inferred from
code):

1. A real staging/production Backend V2 URL exists and is reachable by the frontend/Unity clients
   (closes Gate A).
2. An explicit product decision selects removal, authenticated/account-only access, or
   public/anonymous access (closes Gate B).
3. If the web leaderboard is retained as a browsable multi-mode experience, Backend V2 ships a
   supported-board discovery contract the web client can call (closes Gate C). Removal makes this
   condition inapplicable.
4. (Already satisfied - see Gate D.)
5. If the web leaderboard is retained, a real end-to-end run against the hosted environment from
   (1) - an actual Unity match, a real V2 player session, a persisted `match_results` row, a V2
   leaderboard read, and the expected row rendered on the web - is performed and its result
   recorded here. Removal makes this replacement certification inapplicable.

Only once the applicable gates hold does issue #29's destructive V1 removal become in-scope. Until
then, preserve the isolated V1 route. This 2026-10-02 pass updated evidence only; it changed no
runtime code, dependencies, environment variables, CSP policy, or route behavior.

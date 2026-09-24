# Level 5 Frontend

The web frontend for Sweat This / Level 5: high scores, character/game info, and an
authenticated player account portal (profile, player lookup, friends, and challenges). Built
with Next.js 16 (App Router, Turbopack) and MUI.

## Architecture

The public site (`/`, `/level5`, `/level5/characters`, `/level5/drblood`) reads from a legacy
V1 API and needs no authentication.

The account portal (`/account/*`) is a server-rendered BFF (backend-for-frontend) in front of
**Backend V2** (a separate .NET/PostgreSQL service, repo `sweat-this/Level5Backend`, `v2/`):

```
Browser --HttpOnly session cookie--> Next.js (this repo) --bearer token--> Backend V2
                                            |
                                            +--> Redis (shared session store)
```

- The browser only ever holds one opaque, `__Host-`-prefixed, HttpOnly session cookie. It never
  sees a Backend V2 access or refresh token.
- Next.js Server Actions/Route Handlers resolve that cookie to a session via
  `WebSessionCoordinator`, which reads/writes encrypted session state (AES-256-GCM, rotatable
  key ring) in Redis (`RedisWebSessionStore`) and handles refresh-token rotation with atomic
  compare-and-swap so concurrent requests can't race each other into invalidating a session.
- Every state-changing action carries an Origin-based CSRF check and calls Backend V2 through a
  single typed transport (`src/lib/backend-v2/transport.ts`) with a fixed timeout and a
  narrow, safe-read-only retry policy.

Full detail: [`docs/architecture/web-authentication.md`](docs/architecture/web-authentication.md).
Production configuration, deployment, and operations:
[`docs/operations/frontend-production.md`](docs/operations/frontend-production.md).

## Local development

Requires Node 22+.

```bash
npm install
npm run dev
```

The public site works with no further setup. The account portal needs:

- Backend V2 running locally (see that repo's own README) and `LEVEL5_V2_API_BASE_URL` pointing
  at it.
- `LEVEL5_APP_ORIGIN` set to this app's own origin (e.g. `http://localhost:3000`).
- A session store. By default the app uses an in-memory store, which is fine for local dev but
  is rejected outright in production (see the operations doc). To exercise the real Redis-backed
  path locally, run Redis (`docker run -p 6379:6379 redis:7.4.11-alpine`) and set
  `LEVEL5_WEB_SESSION_STORE=redis` plus the `LEVEL5_WEB_SESSION_*` variables described in the
  operations doc.

## Tests

```bash
npm test              # vitest unit/integration tests
npm run test:redis    # same suite, with the Redis-backed session store tests enabled (needs Redis on :6379)
npm run test:e2e             # Playwright, dev-mode (next dev, plain HTTP)
npm run test:e2e:production  # Playwright, production-mode (next build && next start, real HTTPS,
                              # real Redis, real Backend V2 - see the operations doc)
npm run lint
npm run typecheck
npm run contracts:check      # verifies src/generated/level5-v2.ts matches the pinned OpenAPI snapshot
npm run build
```

The dev-mode E2E suite (`e2e/`) needs a local Backend V2 and Redis instance, same as the account
portal above. The production-mode suite (`e2e-production/`) additionally builds and serves the
app in production mode behind a local, test-only self-signed HTTPS proxy - see
[`docs/operations/frontend-production.md`](docs/operations/frontend-production.md) for exactly
what it certifies and how to run it. Neither suite talks to a real deployed environment;
`test:e2e:production` must never be pointed at production Backend V2 credentials, since it
registers real accounts against whatever backend it's given.

## Backend V1 vs Backend V2

- **Backend V1** (legacy) serves the public site's game/score data. No auth, read-only from this
  app's perspective.
- **Backend V2** (`sweat-this/Level5Backend`, `v2/`) is the authenticated API behind the account
  portal: registration/login/refresh/logout, player profile, friends, and challenges. This repo
  pins a generated TypeScript client against a specific Backend V2 OpenAPI snapshot
  (`contracts/level5-v2.openapi.json` → `src/generated/level5-v2.ts`); `npm run contracts:check`
  in CI guarantees the two stay in sync.

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs on every push to `dev`/`main` and on every pull
request: build/lint/typecheck/unit tests, a Redis-integration job, a production-mode E2E job, and
a supply-chain/security job. `dev` is protected — changes land through reviewed pull requests.

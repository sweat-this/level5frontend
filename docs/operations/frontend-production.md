# Frontend production operations

Deployment, configuration, and failure-diagnosis reference for running this app (the Next.js BFF
in front of Backend V2) in production. Architecture and request-flow detail lives in
[`docs/architecture/web-authentication.md`](../architecture/web-authentication.md); this document
is about running it correctly, not how it's built.

## Environment variables

All of these are server-only (never read in a Client Component, never exposed to the browser).

| Variable | Required | Purpose |
| --- | --- | --- |
| `LEVEL5_V2_API_BASE_URL` | Yes | Absolute Backend V2 base URL (`http(s)://host[:port]`), no path, no embedded credentials. Validated at process startup in production (see below) — malformed values fail fast rather than surfacing as a confusing downstream transport error. |
| `LEVEL5_APP_ORIGIN` | Yes | This app's own public origin (`https://app.example.com`, no path/query/fragment). Used by the Origin-based CSRF check (`origin-policy.ts`) and must exactly match what browsers will send as `Origin` — get this wrong and every state-changing request is rejected. |
| `NODE_ENV` | Yes (set by `next start`) | `production` forces `LEVEL5_WEB_SESSION_STORE=redis` (no in-memory fallback) and disables the certification-only auth bypass. |
| `LEVEL5_WEB_SESSION_STORE` | Yes in production | Must be `redis` in production. `memory` is only valid outside production (local dev, dev-mode E2E). |
| `LEVEL5_WEB_SESSION_REDIS_URL` | Yes when store is `redis` | `redis://` or `rediss://` URL for the shared session store. |
| `LEVEL5_WEB_SESSION_ACTIVE_KEY_ID` | Yes when store is `redis` | Key ID (must exist in the keyring below) used to encrypt newly written sessions. |
| `LEVEL5_WEB_SESSION_KEYRING_JSON` | Yes when store is `redis` | JSON object mapping key ID → base64-encoded 32-byte AES-256-GCM key. May contain more than one key — see "Session key rotation" below. |
| `LEVEL5_TRUSTED_CLIENT_IP_HEADER` | No | Name of the single HTTP header this app trusts as the real client IP (e.g. `x-forwarded-for` or a provider-specific header like `fly-client-ip`, `x-real-ip`). Unset means no trusted client IP is ever forwarded to Backend V2. See "Trusted client IP" below — this is only half of a contract the edge/proxy must complete. |
| `OTEL_EXPORTER_OTLP_ENDPOINT` / `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT` | No | Standard OTLP exporter env vars. Unset means no collector is required and nothing is exported — traces/metrics are still generated in-process either way, just dropped. |

Startup validation: `src/instrumentation.ts`'s `register()` hook calls
`validateProductionRuntimeConfig()` (`src/lib/config/runtime-config.ts`) once, at process boot,
gated to the Node runtime. A malformed `LEVEL5_V2_API_BASE_URL`/`LEVEL5_APP_ORIGIN` or an invalid
session-store configuration throws immediately at startup — the process never comes up and never
serves a request with configuration it can't trust. It never runs during `next build`, since env
vars available at build time aren't guaranteed to be the ones the running process will have.

## Redis

The shared session store. Required in production; a single, non-negotiable dependency of
`/health/ready` (see below). Encrypted at rest with AES-256-GCM before any session document is
written — Redis itself never sees a plaintext access/refresh token. Standard operational
expectations: persistence/replication/backup are the operator's choice (session data is
short-lived and re-derivable by re-login, so this is a durability/UX trade-off, not a
correctness one), but availability directly gates `/health/ready`.

## Session key rotation

Sessions are encrypted with a key identified by `LEVEL5_WEB_SESSION_ACTIVE_KEY_ID`, selected from
`LEVEL5_WEB_SESSION_KEYRING_JSON`. Rotate in three stages, each a separate deploy, **readers
before writers**:

1. **Add the new key, keep the old key active.** Deploy with both old and new key IDs present in
   `LEVEL5_WEB_SESSION_KEYRING_JSON`, `LEVEL5_WEB_SESSION_ACTIVE_KEY_ID` still pointing at the old
   key. Every instance can now decrypt sessions written with either key.
2. **Switch the active key.** Deploy with `LEVEL5_WEB_SESSION_ACTIVE_KEY_ID` pointing at the new
   key, both keys still present in the keyring. New/refreshed sessions are now written with the
   new key; existing sessions written with the old key remain readable.
3. **Retire the old key.** Once no session still encrypted under the old key can plausibly remain
   (older than the maximum session/refresh-token lifetime), deploy with the old key removed from
   the keyring.

Never skip straight to a keyring containing only the new key — that's step 3 done before step 1,
and it treats every still-valid old-key session as undecryptable, forcing an unplanned mass
logout. This sequencing is certified by
`src/lib/web-auth/persisted-web-session.rolling-deployment.test.ts`, which pins the on-the-wire
session document format (`schemaVersion: 1`) across a simulated old-version/new-version rollout so
a rolling deploy (old and new app code briefly serving traffic simultaneously) can't produce a
session one version can write but the other can't read.

## Rolling deployment

During a rolling deploy, old and new app instances serve traffic concurrently against the same
Redis store. This is safe because:

- The persisted session document format is versioned (`schemaVersion: 1`) and additive changes
  are backward-compatible — certified by the rolling-deployment test above.
- Refresh-token rotation uses atomic compare-and-swap (Lua script in
  `redis-web-session-store.ts`), so two instances racing to refresh the same session can't both
  win and silently invalidate each other's result.
- `/health/ready` (see below) means a load balancer only routes to instances that can actually
  serve account traffic, so an instance mid-startup or mid-shutdown is naturally drained.

## Rollback

Rolling back to a previous frontend build is safe under the same versioned-session-format
guarantee, **as long as the session key rotation sequencing above was followed** — i.e. don't
roll back past the deploy that retired an old encryption key while any session could still be
encrypted under it. Rolling back Backend V2 independently is a Backend V2 concern (see that
repo's own operations docs); this frontend has no version pin on Backend V2 beyond the OpenAPI
contract snapshot in `contracts/`.

## Trusted client IP

Backend V2's auth rate limiting partitions by the remote IP it sees
(`RateLimitPartition.GetFixedWindowLimiter` keyed on `HttpContext.Connection.RemoteIpAddress`,
`Program.cs`), which after `UseForwardedHeaders()` reflects `X-Forwarded-For`/`X-Forwarded-Proto`
**only when the immediate connection is in Backend V2's own configured
`ForwardedHeaders:KnownProxies`/`ForwardedHeaders:KnownNetworks`** (Backend V2 `appsettings`). If
this frontend is the only hop between Backend V2 and the internet, Backend V2's known-proxies
config must include this frontend's egress address(es), or the forwarded IP is ignored and every
request is attributed to this frontend's own IP.

This app's half of the contract: `LEVEL5_TRUSTED_CLIENT_IP_HEADER` names exactly one inbound
header this app trusts as the real client IP; `src/lib/net/trusted-client-ip.ts` reads only that
header, rejects anything that isn't a single valid IPv4/IPv6 address (in particular, a
comma-separated list — the shape a misconfigured edge that *appends to* rather than *overwrites*
the header would produce), and never logs or stores it. When present, it's forwarded to Backend V2
as `X-Forwarded-For` on register/login/refresh/logout calls only.

**This app cannot verify the other half of the contract from inside the process.** The edge/proxy
in front of this app (load balancer, CDN, reverse proxy) must:

- Strip any client-supplied copy of the configured header before it reaches this app, and
- Overwrite it with the real client address on every request.

If the edge does not guarantee this, a client can forge the trusted header and spoof rate-limit
identity. This is a deployment/ingress-contract requirement, not something certifiable from
within this repo — the certification here (`e2e-production/` suite) only proves the app-side
resolver behaves correctly and reaches Backend V2 correctly *given* a trustworthy header; it
cannot prove any real ingress actually strips client-supplied values, since that's outside this
process entirely.

## HTTPS and security headers

Production is expected to run behind TLS termination (at the edge or in-process — this app does
not terminate TLS itself). `Strict-Transport-Security` is sent without `preload` or
`includeSubDomains` (neither is verified safe for this deployment). Full header/CSP set and the
reasoning behind each directive: `src/lib/security/headers.ts`'s module doc comment. In short:
`script-src` is nonce-based on the dynamically-rendered `/account/*` routes and `'unsafe-inline'`
on the four static public routes (a nonce cannot be correct on a statically rendered page — see
that file for why); `style-src` is `'unsafe-inline'` everywhere (MUI sets inline style
*attributes*, which no nonce can ever cover). `poweredByHeader` is disabled.

## Health checks

- `GET /health/live` — proves only that the process can respond. No dependency checks. A Redis or
  Backend V2 outage must never fail liveness (that would restart a healthy process into the same
  outage). Use this for a process-restart policy.
- `GET /health/ready` — checks account runtime configuration validity and real Redis
  connectivity (a ping, when the store is `redis`). Deliberately does **not** check Backend V2
  reachability — a transient Backend V2 outage must not pull this frontend out of rotation, since
  the public site and already-issued sessions can keep working. Use this for load-balancer
  routing, not for restart.

Both return `Cache-Control: private, no-store` and never leak configuration or connection error
detail into the response body.

## OpenTelemetry

`src/instrumentation.ts` → `src/lib/otel/register.ts`, using `@vercel/otel` (the Next-recommended
integration). Entirely optional: with no `OTEL_EXPORTER_OTLP_*` endpoint configured, spans and
metrics are generated in-process but nothing is exported and no collector is required — this is
what keeps local dev and CI collector-free.

When configured, this app exports:

- **Traces**: Next's own framework-provided request spans, plus every Backend V2 call
  (`src/lib/backend-v2/transport.ts`) as a span carrying `backend.retry_count`,
  `backend.outcome`, and `http.status_code`, plus session-store operations
  (`redis-web-session-store.ts`) as spans carrying operation name, duration, and outcome —
  **never** a session key, session ID hash, or any credential.
- **Trace propagation**: `@vercel/otel` auto-instruments the global `fetch()`, and each Backend V2
  call additionally sets `opentelemetry: {spanName, propagateContext: true}` on the fetch
  `RequestInit`, so the W3C `traceparent`/`tracestate` headers set by the SDK reach Backend V2 and
  a single trace spans both processes. Backend V2's `ProblemDetails` responses include a
  `traceId` that lines up with this app's trace ID for the same request.
- **Metrics**: an auth/session outcome counter
  (`level5.session_events`, low-cardinality `event` dimension — login/register/refresh
  success/invalid/throttled, CAS contention, store unavailable — never a session/player/tag/cursor
  ID).
- **Unhandled errors**: Next's `onRequestError` hook logs only the route *template* (e.g.
  `/account/challenges/[seriesId]`, never the concrete URL with real dynamic-segment values), HTTP
  method, and the active trace ID — never the request/error object, headers, body, stack trace, or
  any session/player/account identifier. The generic error UI surfaces that trace ID as an opaque
  support reference a user can quote when reporting an issue.

## Build and start

```bash
npm run build
npm run start
```

`next build` must not read any of the required-in-production env vars listed above as if their
build-time absence were acceptable — they're validated at process *startup* (`register()`), not
baked into the build. Build the image/artifact once; supply environment-specific configuration at
`next start` time.

## Deploy order

1. Deploy/roll out Backend V2 first if the change includes a Backend V2 contract change (this
   frontend pins a generated client against `contracts/level5-v2.openapi.json`; verify with
   `npm run contracts:check` that the pinned snapshot matches what's being deployed).
2. Deploy this frontend. `/health/ready` gates traffic — a load balancer should not route to an
   instance until it reports `200`.
3. If the deploy includes a session key rotation, follow the three-stage sequence above; it is
   independent of and can span multiple app deploys.

## Diagnosing common failures

| Symptom | Likely cause | Where to look |
| --- | --- | --- |
| Process won't start | Invalid `LEVEL5_V2_API_BASE_URL`/`LEVEL5_APP_ORIGIN`, or invalid/missing Redis session-store config | Startup log from `validateProductionRuntimeConfig()` — the error names which variable is wrong, never its value. |
| `/health/ready` returns 503 | Redis unreachable, or account runtime config invalid | Check Redis connectivity independently; `/health/ready`'s body never contains detail (by design), so check server logs / Redis directly. |
| Every login/register/logout rejected | `LEVEL5_APP_ORIGIN` doesn't exactly match the browser's real `Origin` (scheme/host/port mismatch, e.g. behind a proxy that changes the apparent origin) | `origin-policy.ts`'s CSRF check; verify what `Origin` header actually reaches this app. |
| Users unexpectedly logged out after a deploy | Session key rotation sequencing skipped a stage (old key retired while sessions still encrypted under it existed) | See "Session key rotation" above — this is why the three-stage order matters. |
| Backend V2 auth rate limiting misattributed across users, or trivially bypassable | Trusted client IP contract broken on the edge side (not stripping/overwriting the configured header), or Backend V2's `KnownProxies`/`KnownNetworks` doesn't include this app's egress address | See "Trusted client IP" above — this is a deployment/ingress issue, not an app bug. |
| A user reports an error with no other detail | Ask for the support reference (trace ID) shown in the error UI | Look up that trace ID in your OTel backend (if OTLP export is configured) or in this app's/Backend V2's structured logs. |
| Public pages (`/`, `/level5`, ...) not being cached as expected | A route was made dynamically-rendered (reads `headers()`/`cookies()`, or otherwise opts out of static rendering) | See `src/lib/security/headers.ts`'s doc comment — this exact failure mode (forcing a page dynamic to thread a CSP nonce) was found and reverted during this work; verify with the production E2E suite's caching checks (`e2e-production/`). |

## Manual accessibility checklist

Automated coverage (`@axe-core/playwright`, `e2e/accessibility.spec.ts`) checks static/DOM-level
WCAG 2.x A/AA violations on the register, login, dashboard, profile, player lookup, friends, and
challenges pages. The following need a manual pass with a keyboard and a screen reader, since axe
cannot certify them:

- Full keyboard-only traversal of each page above: every interactive element reachable via Tab,
  in a logical order, with no keyboard trap.
- Focus visibility: the currently focused element has a visible indicator at every step.
- Form validation errors and async status messages (login/register failures, friend-request
  actions, challenge actions) are announced to a screen reader, not just shown visually.
- The remove/decline confirmation dialogs (friends, challenges) trap focus while open and return
  focus to a sensible element on close.
- Friend/challenge action state (pending/accepted/declined) is conveyed by more than color alone.

Record the result of this manual pass in the final implementation report for issue #10; it is not
part of the automated CI gate.

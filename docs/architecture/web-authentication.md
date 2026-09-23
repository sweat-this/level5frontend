# Web Authentication Architecture (BFF Session Model)

Status: Accepted (issue #3 architecture/certification spike; issue #5 adds the production
session store this document originally deferred - see "Production session store" below).

## Context

Backend V2 exposes a bearer-token auth API (`/api/v2/auth/{register,login,refresh,logout}`,
`GET /api/v2/me`) with short-lived (15 min) access tokens and long-lived (30 day),
one-time-rotating refresh tokens protected by optimistic concurrency. The web frontend
(`level5frontend`, Next.js 16 App Router, server-capable) needs an authenticated account
portal. This document is the architecture for that portal's auth layer, certified before
any account UI is built.

## Decision: browser holds no Backend V2 credential

```
Browser --HttpOnly opaque cookie--> Next.js BFF --bearer tokens--> Backend V2
```

The browser receives only an opaque, cryptographically random session identifier in an
`HttpOnly` cookie. It never receives a Backend V2 access or refresh token in any
response body, cookie, or client-side script. All Backend V2 calls are server-to-server,
issued from Next.js Route Handlers/Server Functions, never from browser JavaScript.

This also means Backend V2's browser CORS policy (loopback-only) needs **no change** -
the browser never calls Backend V2 directly.

## Session identifier and server-side session

- The cookie value is 256 bits of `node:crypto.randomBytes`, base64url-encoded
  (`src/lib/web-auth/session-id.ts`).
- The server-side session store is keyed by `SHA-256(cookie value)`, not the raw value,
  so a store read/leak doesn't itself hand out a usable session credential.
- A `WebSession` record (`src/lib/web-auth/web-session.ts`) holds only what the refresh
  coordinator needs: the access/refresh tokens and their expiries, a `revision` for
  optimistic concurrency, `refreshState`/`refreshLeaseExpiresAt`, and (issue #5)
  `createdAt`/`absoluteExpiresAt` for the fixed absolute session lifetime described below.
  No account/profile data is cached here - Backend V2 remains the authority for that
  (`/api/v2/me`).

## Refresh coordination: CAS, not a lock

Backend V2's refresh tokens are one-time-rotating: two concurrent refresh calls with the
same token mean exactly one succeeds and one gets `401 invalid_refresh_token`. A naive
BFF that lets every request with an expired access token independently call Backend V2
refresh would produce exactly that failure mode under normal concurrent traffic.

Instead, the `WebSessionStore.compareAndSwap(sessionIdHash, expectedRevision,
replacement)` primitive is used as a refresh *claim*: a caller that finds an expired,
`Ready` session moves it to `Refreshing` (revision N+1) via CAS. Only the CAS winner
calls Backend V2 `refresh`. Every other caller observes `Refreshing` and polls the store
(bounded retries, fixed delay) until the winner's result lands, rather than opening its
own refresh call.

**No process-local mutex is used or required.** CAS on the shared store is the only
coordination primitive, which is what makes this safe across horizontally-scaled Next.js
instances now that issue #5 has replaced `MemoryWebSessionStore` with `RedisWebSessionStore`
for production. `web-session-coordinator.concurrency.test.ts` proves the algorithm in-process
against `MemoryWebSessionStore`; `horizontal-instance.redis.test.ts` proves the same thing
against a real, shared Redis with two fully independent client/store/coordinator instances -
both assert exactly one Backend V2 refresh call for 20 concurrent requests against one expired
session.

A real networked store introduces a failure mode `MemoryWebSessionStore` structurally cannot:
a CAS call whose *outcome* is unknown (a timeout, a dropped connection), not just whether it
won or lost. See "Production session store" below for how the coordinator was hardened against
that.

### Refresh lease

A CAS-won `Refreshing` claim carries `refreshLeaseExpiresAt`, set longer than
`BackendAuthClient`'s own request timeout. If a waiter observes an expired lease, it
treats the claim as abandoned (the claimant's process died, or its outcome is simply
unknown) and moves the session to `ReauthenticationRequired` - it never retries the
original refresh token itself, for the same reason described below.

### Refresh outcome classification

| Backend V2 response | Session transition | Rationale |
|---|---|---|
| `200` | `Ready` (rev+1), new access+refresh tokens | Normal rotation. |
| `401 invalid_refresh_token` | `ReauthenticationRequired` | Credential is permanently unusable. |
| `429` (rate limiter, before rotation) | `Ready` (rev+1), **same** tokens | Nothing rotated; preserve the existing refresh token and report a transient `throttled` result - never treat throttling as a compromised credential. |
| Timeout / network error / ambiguous `5xx` | `ReauthenticationRequired` | The request may or may not have reached Backend V2 and rotated the token server-side ("lost response" - see `web-session-coordinator.lost-response.test.ts`). The old refresh token is never reused once its outcome is ambiguous. |

This classification lives in exactly one place, `BackendAuthClient`
(`src/lib/web-auth/backend-auth-client.ts`), which the coordinator depends on only
through the narrow `AuthBackendPort` interface.

### `/me` failure handling

- A `5xx`/network failure from `GET /api/v2/me` preserves the session - it is a
  dependency-unavailable condition, not proof the user is unauthenticated.
- A `401` triggers at most one coordinated refresh and one retry of `/me`. If it still
  fails, the session moves to `ReauthenticationRequired`. This never loops.
- Backend V2's `AccountStatus` (e.g. a disabled account) is not independently
  interpreted by the BFF. Backend V2 already enforces `AccountStatus.Active` at
  login/refresh; a disabled account naturally loses the ability to refresh once its
  current access token expires. The BFF does not invent a stronger rule.

## Production session store (issue #5)

Issue #3 certified the architecture end-to-end against `MemoryWebSessionStore`, a process-local
`Map` explicitly scoped to non-production certification only. Issue #5 adds the production
implementation of `WebSessionStore` (`src/lib/web-auth/web-session-store.ts`) - the coordinator
above is otherwise **unchanged**: it still knows nothing about Redis, only about the
`create`/`find`/`compareAndSwap`/`delete` contract.

### Why Redis

Redis is introduced **only** for web-session infrastructure, not as a general Level 5
application cache. It's used because it natively provides everything the coordinator's
algorithm needs in one place: native per-key TTL (the absolute session lifetime below), a
scripting engine that makes the CAS primitive a single atomic server-side operation, and
low-latency key lookup. Client: `@redis/client@^6.2.1` (the base client package underlying the
`redis` meta-package - chosen over the meta-package to avoid pulling in unused
Bloom/JSON/Search/TimeSeries modules; requires Node >=20, matching this project's Node 22 CI).

### Key namespace and persisted schema

Each session is one Redis string at `level5:web-session:<sha256-hex-of-session-id>` - the same
hash the coordinator already uses as its lookup key (see "Session identifier" above). The value
is one JSON document (`PersistedWebSessionV1`, `src/lib/web-auth/persisted-web-session.ts`):

```
schemaVersion, revision, createdAt, absoluteExpiresAt,
accessTokenExpiresAt, refreshTokenExpiresAt, refreshState, refreshLeaseExpiresAt,
encryptedCredentials: { keyId, iv, ciphertext, authTag }
```

Only `accessToken`/`refreshToken` are secret, so only they live inside `encryptedCredentials`.
`revision` is plaintext (not part of `encryptedCredentials`) because the CAS Lua script below
must read it without decrypting anything.

### Absolute session lifetime

The web session has a **fixed absolute lifetime**, not a sliding/idle-timeout one - there is no
`LastSeenAt` and no session-touch write on ordinary requests. At login,
`absoluteExpiresAt = ` Backend V2's initial `refreshTokenExpiresAt`. On every successful
refresh rotation, `absoluteExpiresAt = min(existing absoluteExpiresAt, the rotated refresh
token's new expiry)` (`nextAbsoluteExpiresAt` in `web-session.ts`) - monotonically
non-increasing, so a web session can legitimately expire *earlier* than Backend V2's own
refresh-session maximum, but never later. `createdAt` is set once at login and never changes.

The Redis key's own TTL is set from `absoluteExpiresAt` directly (`PXAT` on `SET`/via the CAS
script's `PEXPIREAT`) - there is no cleanup job, cron task, or queue. `find()` also defensively
re-checks `absoluteExpiresAt` against the current time after decoding a record, in case of clock
skew or the narrow window between a key's logical and actual eviction.

The browser cookie's `Max-Age` is derived from the same `absoluteExpiresAt`
(`buildSessionCookie` in `cookie-policy.ts`: `max(0, floor((absoluteExpiresAt - now) / 1000))`)
- there is no independent, longer-lived browser cookie lifetime. The cookie can never outlive
the server-side session it names.

### Encryption at rest and key rotation

`accessToken`/`refreshToken` are encrypted with AES-256-GCM (`src/lib/web-auth/session-crypto.ts`)
before ever reaching Redis - a fresh random 96-bit IV per encryption, and additional
authenticated data binding `schemaVersion` and the session's hash, so a decrypted envelope can
never be replayed under a different session or after a schema version bump.

A **keyring** supports one active write key plus zero or more older readable keys
(`LEVEL5_WEB_SESSION_ACTIVE_KEY_ID` / `LEVEL5_WEB_SESSION_KEYRING_JSON`, validated fail-closed in
`session-store-config.ts`). Writes always use the active key; reads select the key by the
envelope's stored `keyId`, so a record written under an older key stays readable as long as that
key remains in the keyring. There is no background re-encryption job - safe rotation is a staged
deploy:

1. Deploy both the old and new key to every instance's keyring; keep the old key active.
2. Deploy again, switching `LEVEL5_WEB_SESSION_ACTIVE_KEY_ID` to the new key.
3. Old-key records are read fine in the meantime, and get naturally rewritten under the new key
   the next time they're normally written (e.g. the next refresh rotation) - no forced rewrite.
4. Only once no record still depends on the old key, remove it from the keyring.

Unknown schema versions, unknown key ids, and any decryption/authentication failure are all
treated as an unusable record: `find()` fails closed (returns "not found" to the coordinator,
which requires reauthentication), emits a fixed `session_record_corrupt` diagnostic event (never
the raw record, ciphertext, or key material), and best-effort deletes the key.

### Atomic compare-and-swap

`compareAndSwap` is one static, parameterized Lua script (`CAS_SCRIPT` in
`redis-web-session-store.ts`, sent via `EVAL` with `KEYS`/`ARGV` - never built from session
data): `GET` the key; a missing key, an undecodable value, or a revision mismatch all return a
definite miss (`0`); a matching revision `SET`s the replacement and `PEXPIREAT`s the new
absolute expiry, atomically, and returns `1`. No distributed lock (Redlock or otherwise) is used
or needed - one `EVAL` against one key is already atomic.

### Store-failure classification and coordinator hardening

A real networked store can fail in a way `MemoryWebSessionStore` never could: an operation whose
outcome is genuinely unknown (a timeout, a dropped connection), not just "found" vs "not found"
or "CAS won" vs "lost". `WebSessionStore` implementations signal this by throwing a narrow
`SessionStoreUnavailableError` (`session-store-errors.ts`) rather than ever returning
`false`/`null` for it - `false` specifically means "this definitely did not win," which is not
the same claim as "this store didn't answer."

The coordinator was hardened accordingly:

- **Refresh claim** - if the claim CAS is ambiguous, the coordinator returns `unavailable`
  immediately: it never calls Backend V2 refresh on an unconfirmed claim, and never loops
  guessing the claim failed. A later request reloads the shared store once it's reachable again.
- **Refresh finalization and 429 rollback** - both go through a shared
  `casWithConfirmation` helper: if the CAS response itself is ambiguous, the coordinator reloads
  the record and only treats it as landed if the reloaded revision/state actually match the
  intended replacement. A newly-rotated Backend V2 credential is never handed back as `ready`,
  and a 429 is never reported as `throttled`, without that confirmation.
- **Lost/unknown Backend V2 refresh outcome** (timeout, network error, ambiguous `5xx`) keeps
  its issue #3 semantics unchanged: the old refresh token is never reused. The transition to
  `ReauthenticationRequired` this triggers is itself best-effort against store failure - safe,
  because a later waiter that finds the session still `Refreshing` past its lease independently
  redoes the same transition (see "Refresh lease" above).

`AccessTokenResult`/`LoginResult` gained an `unavailable` variant for this; `MeResult` already
had one and it's reused as-is. `unavailable` is never turned into a `401`/"unauthenticated" -
Redis being down is a dependency outage, not proof the user is unauthenticated.

### Login orphan-session handling

If Backend V2's login succeeds (it has now issued a real, one-time-rotating refresh session)
but the store `create` fails, the coordinator best-effort revokes that Backend V2 refresh
credential (`backend.logout`), returns `unavailable`, and never returns a `sessionId` - so the
route never sets a browser cookie for a session that can't be tracked. Backend V2 credentials
are never returned to the browser regardless of store outcome.

### Logout failure semantics

`WebSessionCoordinator.logout` never throws. Backend V2 revocation and the store delete are each
independently best-effort: a failure in either is recorded as a diagnostic event
(`logout_backend_revoke_failed` / `session_store_unavailable`) rather than propagated. The
`/api/auth-cert/logout` route additionally wraps the coordinator call in try/catch as a
last-resort safety net, so the browser cookie is expired unconditionally - local logout must
never fail merely because remote cleanup (Backend V2 or Redis) couldn't complete, and the
response must never imply a revocation succeeded when it couldn't even be attempted.

### Schema versioning and rolling deployments

The persisted record carries `schemaVersion: 1`. A reader that doesn't recognize a record's
schema version fails closed exactly like any other corrupt record (reauthentication required,
never a crash or a guessed decode). Planned schema changes follow the standard rolling-deploy
order - deploy a reader that understands both the old and new shape everywhere first, then
start writing the new shape - so an ordinary deploy never invalidates existing sessions.

### Health endpoints

`GET /health/live` (`src/app/health/live/route.ts`) proves only that the Next.js process can
respond - no dependency checks, so a Redis outage never fails liveness. `GET /health/ready`
(`src/app/health/ready/route.ts`) checks what *this* instance needs to serve authenticated
traffic: valid session-store/keyring configuration, and - only when Redis is selected - a real,
short-timeout `PING` against the shared client. `200` when ready, `503` when not; the response
body never includes configuration or connection error detail. Backend V2 is deliberately not
part of either check.

## Cookie policy

| | Development/test | Production |
|---|---|---|
| Name | `level5_session` | `__Host-level5_session` |
| `HttpOnly` | yes | yes |
| `Secure` | no | yes (required by `__Host-`) |
| `SameSite` | `Lax` | `Lax` |
| `Path` | `/` | `/` |
| `Domain` | not set | not set (required by `__Host-`) |
| `Max-Age` | derived from the session's `absoluteExpiresAt` (see "Production session store" above), clamped at 0 |

`__Host-` cookies require `Secure`, `Path=/`, and no `Domain` attribute, which ordinary
HTTP local development can't consistently satisfy - hence the two policies
(`src/lib/web-auth/cookie-policy.ts`, unit-tested for both). The cookie value is always a
fresh, opaque, random session id on every successful login; it is never the access or
refresh token, and its lifetime never exceeds the server-side session's own.

## CSRF / Origin policy

Login is a CSRF surface too, not just post-login mutations - a forged cross-site login
can log a victim's browser into an attacker's account. All certification mutation
routes (`login`, `logout`) require `Origin` to exactly equal the configured
`LEVEL5_APP_ORIGIN`. Missing, malformed, or mismatched `Origin` headers are all
rejected. `Host`/`X-Forwarded-Host` are never used as a substitute, since an untrusted
proxy hop could influence them; `LEVEL5_APP_ORIGIN` is an explicit, server-only,
trusted configuration value.

## Caching

Every authenticated/mutating certification response sets `Cache-Control: private,
no-store`. Every Backend V2 fetch from `BackendAuthClient` uses `cache: "no-store"`.
Route Handlers are dynamic by default and cookie access is itself a request-time API, but
the explicit header/fetch option make the security boundary visible rather than implicit.

## Proxy / client-IP trust model

Backend V2 already only honors `X-Forwarded-For`/`X-Forwarded-Proto` from addresses
listed in its `ForwardedHeaders:KnownProxies`/`KnownNetworks` configuration, and
partitions its auth rate limiter on the resulting connection address. This BFF:

- **never** reads an inbound browser request's `X-Forwarded-For` and relays it -
  `BackendAuthClient` only ever sends a forwarded-for value when a caller explicitly
  passes `ClientIpOverride.testOnlyForwardedFor`, which certification tests use to
  exercise Backend V2's existing trust model with a synthetic, trusted value;
- requires no Backend V2 change, since Backend V2's trust boundary is already
  proxy-address-based, not "trust whatever the client sends".

**What remains deployment-specific (issue #10):** Next.js 16 does not expose a
provider-independent, trustworthy client IP on incoming requests
(`NextRequest.ip` was removed). Production client-IP resolution - i.e. how the BFF
itself learns the real client address from whatever edge/hosting layer sits in front of
it, so it can forward a *trustworthy* value onward - is deployment-specific and is
explicitly **not** certified here. Certifying "Backend V2 trusts configured proxies" and
"the BFF never blindly relays inbound headers" is what issue #3 can honestly prove.

## What remains out of scope

Issue #3 certified the coordinator/cookie/CSRF/origin architecture; issue #5 added the
production session store (Redis, encryption, TTL/absolute lifetime, CAS, and the coordinator
hardening this required - see "Production session store" above). Both `MemoryWebSessionStore`
and `RedisWebSessionStore` are used only by the gated `/api/auth-cert/*` certification routes
(`src/app/api/auth-cert/`), which are force-disabled in production regardless of configuration
(`getWebAuthConfig()` in `src/lib/web-auth/config.ts` evaluates `certificationEnabled` to
`false` whenever `NODE_ENV === "production"`, even if `LEVEL5_AUTH_CERTIFICATION_ENABLED=true`
is set) - they are a temporary certification surface, not a permanent public API contract.

Still explicitly out of scope:

- **Production client-IP/ingress resolution** - see "Proxy / client-IP trust model" above;
  owned by issue #10.
- **Any account/login/registration UI**, generated Backend V2 client (already delivered by
  issue #4), or Backend V2 CORS/token-semantic changes.
- **Redis as a general application cache, distributed locks/Redlock, a queue/pub-sub layer, or
  idle/sliding session expiration.** Issue #5 introduced Redis solely for web-session
  infrastructure, with the absolute (not sliding) lifetime described above.
- **Full OpenTelemetry/exporter infrastructure.** The session-observability event surface
  (`src/lib/web-auth/session-observability.ts`) is a narrow, low-cardinality diagnostic log
  compatible with a future telemetry pass (#10), not a replacement for one.

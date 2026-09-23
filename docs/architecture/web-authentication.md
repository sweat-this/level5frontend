# Web Authentication Architecture (BFF Session Model)

Status: Accepted (issue #3 architecture/certification spike).

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
  optimistic concurrency, and `refreshState`/`refreshLeaseExpiresAt`. No account/profile
  data is cached here - Backend V2 remains the authority for that (`/api/v2/me`).

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
instances once issue #5 replaces `MemoryWebSessionStore` with a real shared store - see
`web-session-coordinator.concurrency.test.ts`, which runs two independent
`WebSessionCoordinator` instances against one shared store and asserts exactly one
Backend V2 refresh call for 20 concurrent requests.

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

## Cookie policy

| | Development/test | Production |
|---|---|---|
| Name | `level5_session` | `__Host-level5_session` |
| `HttpOnly` | yes | yes |
| `Secure` | no | yes (required by `__Host-`) |
| `SameSite` | `Lax` | `Lax` |
| `Path` | `/` | `/` |
| `Domain` | not set | not set (required by `__Host-`) |

`__Host-` cookies require `Secure`, `Path=/`, and no `Domain` attribute, which ordinary
HTTP local development can't consistently satisfy - hence the two policies
(`src/lib/web-auth/cookie-policy.ts`, unit-tested for both). The cookie value is always a
fresh, opaque, random session id on every successful login; it is never the access or
refresh token.

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

## What is explicitly out of scope for issue #3

- **Production session store.** `MemoryWebSessionStore` is a process-local `Map`:
  it does not survive restarts and is not shared across horizontally-scaled instances.
  It is used only by the gated `/api/auth-cert/*` certification routes
  (`src/app/api/auth-cert/`), which are force-disabled in production regardless of
  configuration (`getWebAuthConfig()` in `src/lib/web-auth/config.ts` evaluates
  `certificationEnabled` to `false` whenever `NODE_ENV === "production"`, even if
  `LEVEL5_AUTH_CERTIFICATION_ENABLED=true` is set). **Issue #5** owns the real shared,
  horizontally-scalable, CAS-capable store.
- **Refresh-token-at-rest encryption and key management.** Since the only store in #3
  is non-production in-memory storage, adding encryption now would duplicate work
  issue #5 must do properly against real persistent storage.
- **Production client-IP/ingress resolution** - see above; owned by issue #10.
- **Any account/login/registration UI**, generated Backend V2 client (issue #4), or
  Backend V2 CORS/token-semantic changes.

The `/api/auth-cert/*` route paths are a temporary certification surface, not a
permanent public API contract.

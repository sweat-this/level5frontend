import "server-only";
import type {
  AccessTokenResponseDto,
  AuthBackendPort,
  ClientIpOverride,
  CurrentAccountResponseDto,
} from "./backend-auth-client";
import { recordSessionEvent } from "./session-observability";
import { generateSessionId, hashSessionId } from "./session-id";
import { SessionStoreUnavailableError } from "./session-store-errors";
import {
  isAccessTokenExpired,
  isRefreshLeaseExpired,
  nextAbsoluteExpiresAt,
  type WebSession,
} from "./web-session";
import type { WebSessionStore } from "./web-session-store";

export type LoginResult =
  | { kind: "success"; sessionId: string; absoluteExpiresAt: number }
  | { kind: "invalid_credentials" }
  | { kind: "rate_limited" }
  | { kind: "unknown_failure" }
  // Backend V2 login succeeded (a real refresh session now exists there) but the shared store
  // couldn't durably record our side of it - see login()'s orphan-session handling below. Never
  // a cookie/sessionId in this case.
  | { kind: "unavailable" };

/**
 * Mirrors LoginResult's passthrough-on-non-success shape, but with registration's actual
 * Backend V2 failure modes (see BackendAuthClient.RegisterOutcome) instead of login's. A
 * successful registration goes through the exact same createSession() path as login - see
 * register() below - so it never issues a second login request for credentials Backend V2
 * already returned.
 */
export type RegisterResult =
  | { kind: "success"; sessionId: string; absoluteExpiresAt: number }
  | { kind: "validation_failed"; message: string; traceId?: string }
  | { kind: "conflict"; message: string; traceId?: string }
  | { kind: "rate_limited" }
  | { kind: "unknown_failure"; traceId?: string }
  // Same orphan-session meaning as LoginResult's "unavailable" - see createSession().
  | { kind: "unavailable" };

export type AccessTokenResult =
  | { kind: "ready"; accessToken: string }
  | { kind: "reauthentication_required" }
  // Backend V2's rate limiter rejected the refresh attempt before rotating anything -
  // the existing refresh credential is still good; this is a transient condition, not
  // an auth failure. See Problem 5.
  | { kind: "throttled" }
  | { kind: "not_found" }
  // The shared session store's outcome was genuinely unknown (timeout/connection failure) at a
  // point where guessing would be unsafe - see docs/architecture/web-authentication.md's
  // "Coordinator Failure Hardening" section.
  | { kind: "unavailable" };

export type MeResult =
  | { kind: "success"; account: CurrentAccountResponseDto }
  | { kind: "reauthentication_required" }
  | { kind: "throttled" }
  | { kind: "unavailable" }
  | { kind: "not_found" };

export interface WebSessionCoordinatorOptions {
  readonly now?: () => number;
  // Must exceed BackendAuthClient's own request timeout so a claimant's in-flight
  // refresh call can never outlive its own lease. See Problem 3.
  readonly refreshLeaseMs?: number;
  readonly waitDelayMs?: number;
  readonly maxWaitRetries?: number;
}

const DEFAULT_REFRESH_LEASE_MS = 10_000;
const DEFAULT_WAIT_DELAY_MS = 100;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** True only for the one error type a WebSessionStore is allowed to throw - see its JSDoc. */
function isStoreUnavailable(err: unknown): err is SessionStoreUnavailableError {
  return err instanceof SessionStoreUnavailableError;
}

function credentialsToReadySession(
  sessionIdHash: string,
  credentials: AccessTokenResponseDto,
  revision: number,
  now: number,
  previous: { createdAt: number; absoluteExpiresAt: number } | null,
): WebSession {
  const refreshTokenExpiresAt = Date.parse(credentials.refreshTokenExpiresAt);
  return {
    sessionIdHash,
    accessToken: credentials.accessToken,
    accessTokenExpiresAt: Date.parse(credentials.expiresAt),
    refreshToken: credentials.refreshToken,
    refreshTokenExpiresAt,
    revision,
    refreshState: "Ready",
    refreshLeaseExpiresAt: null,
    createdAt: previous?.createdAt ?? now,
    // The fixed absolute web-session lifetime rule (issue #5): never extended, only ever
    // shortened to the earlier of the existing deadline and this rotation's own refresh-token
    // expiry. See web-session.ts's nextAbsoluteExpiresAt doc comment.
    absoluteExpiresAt: nextAbsoluteExpiresAt(
      previous?.absoluteExpiresAt,
      refreshTokenExpiresAt,
    ),
  };
}

/**
 * Owns the whole web-session lifecycle: login, access-token selection, and - the
 * architecturally important part - refresh coordination. The only coordination
 * primitive is WebSessionStore.compareAndSwap; no in-process lock is used or required,
 * so two coordinators sharing one store behave correctly under concurrency (see the
 * concurrency test and docs/architecture/web-authentication.md).
 *
 * Every WebSessionStore call here is wrapped so a `SessionStoreUnavailableError` (a real,
 * networked store's outcome-unknown case - see web-session-store.ts) never gets treated as a
 * definite result. This distinction didn't matter against MemoryWebSessionStore, which made
 * persistence effectively certain - it matters once RedisWebSessionStore (issue #5) is the store
 * in play.
 */
export class WebSessionCoordinator {
  private readonly now: () => number;
  private readonly refreshLeaseMs: number;
  private readonly waitDelayMs: number;
  private readonly maxWaitRetries: number;

  constructor(
    private readonly store: WebSessionStore,
    private readonly backend: AuthBackendPort,
    options: WebSessionCoordinatorOptions = {},
  ) {
    this.now = options.now ?? Date.now;
    this.refreshLeaseMs = options.refreshLeaseMs ?? DEFAULT_REFRESH_LEASE_MS;
    this.waitDelayMs = options.waitDelayMs ?? DEFAULT_WAIT_DELAY_MS;
    // Derived from the lease rather than an independent constant: a waiter must never
    // give up before a claim's lease could legitimately still be held, or an ordinary
    // slow-but-successful refresh looks indistinguishable from an abandoned one.
    this.maxWaitRetries =
      options.maxWaitRetries ??
      Math.ceil(this.refreshLeaseMs / this.waitDelayMs);
  }

  async login(
    username: string,
    password: string,
    ip?: ClientIpOverride,
  ): Promise<LoginResult> {
    const outcome = await this.backend.login(username, password, ip);
    recordSessionEvent("login_outcome", { kind: outcome.kind });
    if (outcome.kind !== "success") {
      return outcome;
    }
    return this.createSession(outcome.credentials, "login_create");
  }

  /**
   * Registration and login both end with the same thing: real Backend V2 credentials that need
   * a fresh browser-facing web session. This is that shared path (see createSession()) - a
   * successful registration establishes the session directly, never issuing a second login
   * request for credentials Backend V2 already returned.
   */
  async register(
    username: string,
    password: string,
    displayName: string,
    ip?: ClientIpOverride,
  ): Promise<RegisterResult> {
    const outcome = await this.backend.register(
      username,
      password,
      displayName,
      ip,
    );
    recordSessionEvent("register_outcome", { kind: outcome.kind });
    if (outcome.kind !== "success") {
      return outcome;
    }
    return this.createSession(outcome.credentials, "register_create");
  }

  /**
   * Generates a fresh opaque session id, persists the shared WebSession, and returns what the
   * browser cookie needs - or, if the store can't durably record it, best-effort revokes the
   * Backend V2 credential it was just handed (orphan-session guard) and reports `unavailable`
   * without ever returning a sessionId. Shared by login() and register() - see issue #6's
   * "Shared session-creation path". `operation` labels the emitted diagnostic event with which
   * caller triggered it, so an orphan-session failure during registration is never misreported
   * as a login failure.
   */
  private async createSession(
    credentials: AccessTokenResponseDto,
    operation: "login_create" | "register_create",
  ): Promise<
    | { kind: "success"; sessionId: string; absoluteExpiresAt: number }
    | { kind: "unavailable" }
  > {
    const sessionId = generateSessionId();
    const sessionIdHash = hashSessionId(sessionId);
    const session = credentialsToReadySession(
      sessionIdHash,
      credentials,
      1,
      this.now(),
      null,
    );

    try {
      await this.store.create(session);
    } catch (err) {
      if (!isStoreUnavailable(err)) {
        throw err;
      }
      recordSessionEvent("session_store_unavailable", { operation });
      // Orphan-session guard: Backend V2 already issued a real, one-time-rotating refresh
      // session. If we can't durably record our side of it, we must not hand the browser a
      // cookie for a session we can't track - and we must not leave that Backend credential
      // dangling either (best-effort; BackendAuthClient.logout never throws).
      await this.backend.logout(credentials.refreshToken);
      return { kind: "unavailable" };
    }

    recordSessionEvent("session_created");
    return {
      kind: "success",
      sessionId,
      absoluteExpiresAt: session.absoluteExpiresAt,
    };
  }

  /**
   * Never throws - local invalidation (the caller's cookie) must not depend on remote cleanup
   * succeeding. Best-effort Backend V2 revocation and store deletion each independently report a
   * diagnostic event on failure rather than propagate (see
   * docs/architecture/web-authentication.md's logout-failure semantics).
   */
  async logout(sessionId: string, ip?: ClientIpOverride): Promise<void> {
    const sessionIdHash = hashSessionId(sessionId);

    let session: WebSession | null;
    try {
      session = await this.store.find(sessionIdHash);
    } catch (err) {
      if (!isStoreUnavailable(err)) {
        throw err;
      }
      recordSessionEvent("session_store_unavailable", {
        operation: "logout_find",
      });
      return;
    }

    if (session) {
      // Best-effort - BackendAuthClient.logout never throws.
      const revoked = await this.backend.logout(session.refreshToken, ip);
      if (!revoked) {
        recordSessionEvent("logout_backend_revoke_failed");
      }
    }

    try {
      await this.store.delete(sessionIdHash);
    } catch (err) {
      if (!isStoreUnavailable(err)) {
        throw err;
      }
      recordSessionEvent("session_store_unavailable", {
        operation: "logout_delete",
      });
    }
  }

  async getAccessToken(
    sessionId: string,
    ip?: ClientIpOverride,
  ): Promise<AccessTokenResult> {
    const sessionIdHash = hashSessionId(sessionId);
    let session: WebSession | null;
    try {
      session = await this.store.find(sessionIdHash);
    } catch (err) {
      if (!isStoreUnavailable(err)) {
        throw err;
      }
      recordSessionEvent("session_store_unavailable", {
        operation: "get_access_token",
      });
      return { kind: "unavailable" };
    }
    if (!session) {
      return { kind: "not_found" };
    }
    return this.ensureFreshAccessToken(sessionIdHash, session, false, ip);
  }

  async getMe(sessionId: string, ip?: ClientIpOverride): Promise<MeResult> {
    const sessionIdHash = hashSessionId(sessionId);

    let initialSession: WebSession | null;
    try {
      initialSession = await this.store.find(sessionIdHash);
    } catch (err) {
      if (!isStoreUnavailable(err)) {
        throw err;
      }
      recordSessionEvent("session_store_unavailable", {
        operation: "get_me_initial",
      });
      return { kind: "unavailable" };
    }
    if (!initialSession) {
      return { kind: "not_found" };
    }

    // If the token was already locally expired, ensureFreshAccessToken below performs
    // a refresh before /me is ever called - so a 401 afterwards has already gone
    // through one coordinated refresh and must not trigger a second one (Problem 15:
    // "if locally expired: refresh before /me, else: refresh once on 401" - the two
    // are alternatives, not both).
    const alreadyRefreshedForThisCall = isAccessTokenExpired(
      initialSession,
      this.now(),
    );

    const tokenResult = await this.ensureFreshAccessToken(
      sessionIdHash,
      initialSession,
      false,
      ip,
    );
    if (tokenResult.kind !== "ready") {
      return tokenResult;
    }

    const meOutcome = await this.backend.getMe(tokenResult.accessToken);
    if (meOutcome.kind === "success") {
      return { kind: "success", account: meOutcome.account };
    }
    if (meOutcome.kind === "unavailable") {
      // Transient dependency failure, not an auth failure - preserve the session.
      return { kind: "unavailable" };
    }

    // meOutcome.kind === "unauthorized"
    if (alreadyRefreshedForThisCall) {
      return this.requireReauthentication(sessionIdHash);
    }

    // The token was locally valid but Backend V2 disagreed: one coordinated refresh,
    // then retry /me once. Never loop past this single retry (Problem 15).
    let session: WebSession | null;
    try {
      session = await this.store.find(sessionIdHash);
    } catch (err) {
      if (!isStoreUnavailable(err)) {
        throw err;
      }
      recordSessionEvent("session_store_unavailable", {
        operation: "get_me_retry",
      });
      return { kind: "unavailable" };
    }
    if (!session) {
      return { kind: "not_found" };
    }

    const refreshResult = await this.ensureFreshAccessToken(
      sessionIdHash,
      session,
      true,
      ip,
    );
    if (refreshResult.kind !== "ready") {
      return refreshResult;
    }

    const retryOutcome = await this.backend.getMe(refreshResult.accessToken);
    if (retryOutcome.kind === "success") {
      return { kind: "success", account: retryOutcome.account };
    }
    if (retryOutcome.kind === "unavailable") {
      return { kind: "unavailable" };
    }

    // Backend V2 still says unauthorized right after a successful coordinated refresh -
    // trust the backend over our local state and require reauthentication.
    return this.requireReauthentication(sessionIdHash);
  }

  private async requireReauthentication(
    sessionIdHash: string,
  ): Promise<MeResult> {
    try {
      const current = await this.store.find(sessionIdHash);
      if (current) {
        await this.transitionToReauthRequired(sessionIdHash, current);
      }
    } catch (err) {
      if (!isStoreUnavailable(err)) {
        throw err;
      }
      recordSessionEvent("session_store_unavailable", {
        operation: "require_reauth",
      });
    }
    return { kind: "reauthentication_required" };
  }

  /**
   * Returns a usable access token for `session`, claiming and performing a refresh if
   * needed, or joining/waiting on another caller's in-flight refresh. `forceRefresh`
   * skips the "already valid" fast path exactly once, for the /me-401 case where
   * Backend V2 disagrees with our locally cached expiry.
   */
  private async ensureFreshAccessToken(
    sessionIdHash: string,
    initialSession: WebSession,
    forceRefresh: boolean,
    ip?: ClientIpOverride,
  ): Promise<AccessTokenResult> {
    let session = initialSession;

    for (let attempt = 0; attempt <= this.maxWaitRetries; attempt++) {
      const step = await this.advanceRefresh(
        sessionIdHash,
        session,
        forceRefresh && attempt === 0,
        ip,
      );
      if (step.kind === "done") {
        return step.result;
      }
      session = step.session;
    }

    return { kind: "reauthentication_required" };
  }

  /** One attempt at making progress towards a fresh access token for `session`. */
  private async advanceRefresh(
    sessionIdHash: string,
    session: WebSession,
    skipFastPath: boolean,
    ip?: ClientIpOverride,
  ): Promise<
    | { kind: "retry"; session: WebSession }
    | { kind: "done"; result: AccessTokenResult }
  > {
    if (session.refreshState === "ReauthenticationRequired") {
      return { kind: "done", result: { kind: "reauthentication_required" } };
    }

    if (session.refreshState === "Ready") {
      if (!skipFastPath && !isAccessTokenExpired(session, this.now())) {
        return {
          kind: "done",
          result: { kind: "ready", accessToken: session.accessToken },
        };
      }

      const claim = await this.claimRefresh(sessionIdHash, session);
      if (claim.kind === "claimed") {
        return {
          kind: "done",
          result: await this.performRefresh(sessionIdHash, claim.session, ip),
        };
      }
      if (claim.kind === "unavailable") {
        // Per issue #5: never guess that a claim whose outcome is unknown actually failed. Don't
        // call Backend V2 refresh, don't loop - a later request reloads the shared store once
        // it's reachable again and determines the real state.
        recordSessionEvent("refresh_outcome_unknown", { stage: "claim" });
        return { kind: "done", result: { kind: "unavailable" } };
      }
      // claim.kind === "lost": someone else claimed it between our find() and this CAS - reload
      // and rejoin as a waiter.
      recordSessionEvent("refresh_claim_lost");
      return this.reloadForRetry(sessionIdHash);
    }

    // session.refreshState === "Refreshing", owned by another caller.
    if (isRefreshLeaseExpired(session, this.now())) {
      // The claimant is presumed gone. Its outcome is unknown, so - exactly like an
      // ambiguous network failure - the old refresh token is never reused (Problem 3).
      await this.transitionToReauthRequired(sessionIdHash, session);
      return this.reloadForRetry(sessionIdHash);
    }

    await delay(this.waitDelayMs);
    return this.reloadForRetry(sessionIdHash);
  }

  private async reloadForRetry(
    sessionIdHash: string,
  ): Promise<
    | { kind: "retry"; session: WebSession }
    | { kind: "done"; result: AccessTokenResult }
  > {
    let reloaded: WebSession | null;
    try {
      reloaded = await this.store.find(sessionIdHash);
    } catch (err) {
      if (!isStoreUnavailable(err)) {
        throw err;
      }
      recordSessionEvent("session_store_unavailable", {
        operation: "reload_for_retry",
      });
      return { kind: "done", result: { kind: "unavailable" } };
    }
    return reloaded
      ? { kind: "retry", session: reloaded }
      : { kind: "done", result: { kind: "not_found" } };
  }

  private async claimRefresh(
    sessionIdHash: string,
    session: WebSession,
  ): Promise<
    | { kind: "claimed"; session: WebSession }
    | { kind: "lost" }
    | { kind: "unavailable" }
  > {
    const refreshingSession: WebSession = {
      ...session,
      refreshState: "Refreshing",
      revision: session.revision + 1,
      refreshLeaseExpiresAt: this.now() + this.refreshLeaseMs,
    };
    try {
      const won = await this.store.compareAndSwap(
        sessionIdHash,
        session.revision,
        refreshingSession,
      );
      return won
        ? { kind: "claimed", session: refreshingSession }
        : { kind: "lost" };
    } catch (err) {
      if (!isStoreUnavailable(err)) {
        throw err;
      }
      return { kind: "unavailable" };
    }
  }

  /**
   * Issues one CAS write and confirms it actually landed, tolerating an ambiguous store
   * response - used only where the caller must never report success (a rotated Backend V2
   * credential as ready, or a 429 rollback as complete) without durable confirmation. A definite
   * CAS-false ("lost") shouldn't normally happen here, since the caller always holds the
   * exclusive claim it's replacing - handled conservatively rather than assumed benign.
   */
  private async casWithConfirmation(
    sessionIdHash: string,
    expectedRevision: number,
    replacement: WebSession,
  ): Promise<"landed" | "lost" | "unavailable"> {
    let outcome: boolean | "ambiguous";
    try {
      outcome = await this.store.compareAndSwap(
        sessionIdHash,
        expectedRevision,
        replacement,
      );
    } catch (err) {
      if (!isStoreUnavailable(err)) {
        throw err;
      }
      outcome = "ambiguous";
    }
    if (outcome === true) {
      return "landed";
    }
    if (outcome === false) {
      return "lost";
    }

    // Ambiguous: the write may or may not have landed. Reload and verify - never assume success
    // just because the store call itself has since become unreachable.
    let reloaded: WebSession | null;
    try {
      reloaded = await this.store.find(sessionIdHash);
    } catch (err) {
      if (!isStoreUnavailable(err)) {
        throw err;
      }
      return "unavailable";
    }
    const landed =
      reloaded !== null &&
      reloaded.revision === replacement.revision &&
      reloaded.refreshState === replacement.refreshState;
    return landed ? "landed" : "unavailable";
  }

  private async performRefresh(
    sessionIdHash: string,
    refreshingSession: WebSession,
    ip?: ClientIpOverride,
  ): Promise<AccessTokenResult> {
    const outcome = await this.backend.refresh(
      refreshingSession.refreshToken,
      ip,
    );

    if (outcome.kind === "success") {
      const readySession = credentialsToReadySession(
        sessionIdHash,
        outcome.credentials,
        refreshingSession.revision + 1,
        this.now(),
        {
          createdAt: refreshingSession.createdAt,
          absoluteExpiresAt: refreshingSession.absoluteExpiresAt,
        },
      );
      const confirmation = await this.casWithConfirmation(
        sessionIdHash,
        refreshingSession.revision,
        readySession,
      );
      if (confirmation === "landed") {
        recordSessionEvent("refresh_success");
        return { kind: "ready", accessToken: readySession.accessToken };
      }
      if (confirmation === "unavailable") {
        // Never hand back a rotated credential as usable until it's known to be durably
        // persisted (issue #5's central rule). A later request reloads and discovers the real
        // state once the store is reachable again.
        recordSessionEvent("refresh_outcome_unknown", { stage: "finalize" });
        return { kind: "unavailable" };
      }
      await this.transitionToReauthRequired(sessionIdHash, refreshingSession);
      return { kind: "reauthentication_required" };
    }

    if (outcome.kind === "invalid") {
      recordSessionEvent("refresh_invalid");
      await this.transitionToReauthRequired(sessionIdHash, refreshingSession);
      return { kind: "reauthentication_required" };
    }

    if (outcome.kind === "rate_limited") {
      // Nothing rotated on the backend - roll the claim back to Ready so the existing
      // refresh token remains usable for a later attempt (Problem 5).
      const rolledBack: WebSession = {
        ...refreshingSession,
        refreshState: "Ready",
        revision: refreshingSession.revision + 1,
        refreshLeaseExpiresAt: null,
      };
      const confirmation = await this.casWithConfirmation(
        sessionIdHash,
        refreshingSession.revision,
        rolledBack,
      );
      if (confirmation === "landed") {
        recordSessionEvent("refresh_throttled");
        return { kind: "throttled" };
      }
      if (confirmation === "unavailable") {
        // Same durability rule as the success path: don't report "throttled" (implying the
        // existing refresh token is safely usable again) until the rollback is confirmed.
        recordSessionEvent("refresh_outcome_unknown", { stage: "rollback" });
        return { kind: "unavailable" };
      }
      await this.transitionToReauthRequired(sessionIdHash, refreshingSession);
      return { kind: "reauthentication_required" };
    }

    // outcome.kind === "unknown_failure": timeout, connection loss, or an ambiguous
    // 5xx. The refresh may or may not have landed on the backend, so this refresh
    // token can never be retried (Problem 4).
    recordSessionEvent("refresh_outcome_unknown", { stage: "backend_call" });
    await this.transitionToReauthRequired(sessionIdHash, refreshingSession);
    return { kind: "reauthentication_required" };
  }

  /**
   * Best-effort: swallows a store-unavailable outcome rather than propagating it. Safe because
   * the security invariant this protects ("never reuse this refresh token") is already enforced
   * by the caller's own return value; a later reader that finds this session still "Refreshing"
   * past its lease independently redoes this same transition (see advanceRefresh).
   */
  private async transitionToReauthRequired(
    sessionIdHash: string,
    session: WebSession,
  ): Promise<void> {
    const next: WebSession = {
      ...session,
      refreshState: "ReauthenticationRequired",
      revision: session.revision + 1,
      refreshLeaseExpiresAt: null,
    };
    try {
      await this.store.compareAndSwap(sessionIdHash, session.revision, next);
    } catch (err) {
      if (!isStoreUnavailable(err)) {
        throw err;
      }
      recordSessionEvent("session_store_unavailable", {
        operation: "transition_reauth",
      });
    }
  }
}

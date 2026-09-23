import "server-only";
import type {
  AccessTokenResponseDto,
  AuthBackendPort,
  CurrentAccountResponseDto,
} from "./backend-auth-client";
import { generateSessionId, hashSessionId } from "./session-id";
import {
  isAccessTokenExpired,
  isRefreshLeaseExpired,
  type WebSession,
} from "./web-session";
import type { WebSessionStore } from "./web-session-store";

export type LoginResult =
  | { kind: "success"; sessionId: string }
  | { kind: "invalid_credentials" }
  | { kind: "rate_limited" }
  | { kind: "unknown_failure" };

export type AccessTokenResult =
  | { kind: "ready"; accessToken: string }
  | { kind: "reauthentication_required" }
  // Backend V2's rate limiter rejected the refresh attempt before rotating anything -
  // the existing refresh credential is still good; this is a transient condition, not
  // an auth failure. See Problem 5.
  | { kind: "throttled" }
  | { kind: "not_found" };

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

function credentialsToReadySession(
  sessionIdHash: string,
  credentials: AccessTokenResponseDto,
  revision: number,
): WebSession {
  return {
    sessionIdHash,
    accessToken: credentials.accessToken,
    accessTokenExpiresAt: Date.parse(credentials.expiresAt),
    refreshToken: credentials.refreshToken,
    refreshTokenExpiresAt: Date.parse(credentials.refreshTokenExpiresAt),
    revision,
    refreshState: "Ready",
    refreshLeaseExpiresAt: null,
  };
}

/**
 * Owns the whole web-session lifecycle: login, access-token selection, and - the
 * architecturally important part - refresh coordination. The only coordination
 * primitive is WebSessionStore.compareAndSwap; no in-process lock is used or required,
 * so two coordinators sharing one store behave correctly under concurrency (see the
 * concurrency test and docs/architecture/web-authentication.md).
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

  async login(username: string, password: string): Promise<LoginResult> {
    const outcome = await this.backend.login(username, password);
    if (outcome.kind !== "success") {
      return outcome;
    }

    const sessionId = generateSessionId();
    const sessionIdHash = hashSessionId(sessionId);
    await this.store.create(
      credentialsToReadySession(sessionIdHash, outcome.credentials, 1),
    );
    return { kind: "success", sessionId };
  }

  async logout(sessionId: string): Promise<void> {
    const sessionIdHash = hashSessionId(sessionId);
    const session = await this.store.find(sessionIdHash);
    if (session) {
      // Best-effort - BackendAuthClient.logout never throws. Local invalidation below
      // always runs regardless of the backend outcome (Problem: logout must not leave
      // the browser locally authenticated even if Backend V2 is unreachable).
      await this.backend.logout(session.refreshToken);
    }
    await this.store.delete(sessionIdHash);
  }

  async getAccessToken(sessionId: string): Promise<AccessTokenResult> {
    const sessionIdHash = hashSessionId(sessionId);
    const session = await this.store.find(sessionIdHash);
    if (!session) {
      return { kind: "not_found" };
    }
    return this.ensureFreshAccessToken(sessionIdHash, session, false);
  }

  async getMe(sessionId: string): Promise<MeResult> {
    const sessionIdHash = hashSessionId(sessionId);
    const initialSession = await this.store.find(sessionIdHash);
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
    const session = await this.store.find(sessionIdHash);
    if (!session) {
      return { kind: "not_found" };
    }

    const refreshResult = await this.ensureFreshAccessToken(
      sessionIdHash,
      session,
      true,
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
    const current = await this.store.find(sessionIdHash);
    if (current) {
      await this.transitionToReauthRequired(sessionIdHash, current);
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
  ): Promise<AccessTokenResult> {
    let session = initialSession;

    for (let attempt = 0; attempt <= this.maxWaitRetries; attempt++) {
      const step = await this.advanceRefresh(
        sessionIdHash,
        session,
        forceRefresh && attempt === 0,
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
          result: await this.performRefresh(sessionIdHash, claim.session),
        };
      }
      // Someone else claimed it between our find() and this CAS - reload and rejoin.
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
    const reloaded = await this.store.find(sessionIdHash);
    return reloaded
      ? { kind: "retry", session: reloaded }
      : { kind: "done", result: { kind: "not_found" } };
  }

  private async claimRefresh(
    sessionIdHash: string,
    session: WebSession,
  ): Promise<{ kind: "claimed"; session: WebSession } | { kind: "lost" }> {
    const refreshingSession: WebSession = {
      ...session,
      refreshState: "Refreshing",
      revision: session.revision + 1,
      refreshLeaseExpiresAt: this.now() + this.refreshLeaseMs,
    };
    const won = await this.store.compareAndSwap(
      sessionIdHash,
      session.revision,
      refreshingSession,
    );
    return won
      ? { kind: "claimed", session: refreshingSession }
      : { kind: "lost" };
  }

  private async performRefresh(
    sessionIdHash: string,
    refreshingSession: WebSession,
  ): Promise<AccessTokenResult> {
    const outcome = await this.backend.refresh(refreshingSession.refreshToken);

    if (outcome.kind === "success") {
      const readySession = credentialsToReadySession(
        sessionIdHash,
        outcome.credentials,
        refreshingSession.revision + 1,
      );
      await this.store.compareAndSwap(
        sessionIdHash,
        refreshingSession.revision,
        readySession,
      );
      return { kind: "ready", accessToken: readySession.accessToken };
    }

    if (outcome.kind === "invalid") {
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
      await this.store.compareAndSwap(
        sessionIdHash,
        refreshingSession.revision,
        rolledBack,
      );
      return { kind: "throttled" };
    }

    // outcome.kind === "unknown_failure": timeout, connection loss, or an ambiguous
    // 5xx. The refresh may or may not have landed on the backend, so this refresh
    // token can never be retried (Problem 4).
    await this.transitionToReauthRequired(sessionIdHash, refreshingSession);
    return { kind: "reauthentication_required" };
  }

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
    await this.store.compareAndSwap(sessionIdHash, session.revision, next);
  }
}

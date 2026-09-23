import "server-only";
import { getWebAuthConfig } from "./config";

// Comfortably longer than any single Backend V2 request should take, short enough that a
// stuck backend fails fast instead of pinning a refresh lease's whole budget on one call.
const REQUEST_TIMEOUT_MS = 5000;

/** Wire shape of Backend V2's AccessTokenResponseDto (ASP.NET Core's default camelCase). */
export interface AccessTokenResponseDto {
  accessToken: string;
  expiresAt: string;
  playerId: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
}

/** Wire shape of Backend V2's CurrentAccountResponseDto. */
export interface CurrentAccountResponseDto {
  accountId: string;
  username: string;
  status: string;
  playerId: string;
  createdAt: string;
}

export type LoginOutcome =
  | { kind: "success"; credentials: AccessTokenResponseDto }
  | { kind: "invalid_credentials" }
  | { kind: "rate_limited" }
  | { kind: "unknown_failure" };

export type RefreshOutcome =
  | { kind: "success"; credentials: AccessTokenResponseDto }
  | { kind: "invalid" }
  | { kind: "rate_limited" }
  | { kind: "unknown_failure" };

export type MeOutcome =
  | { kind: "success"; account: CurrentAccountResponseDto }
  | { kind: "unauthorized" }
  | { kind: "unavailable" };

export interface ClientIpOverride {
  // Test-only: injects a trusted synthetic client IP as X-Forwarded-For so Backend V2's
  // existing KnownProxies/KnownNetworks trust model can be exercised in certification.
  // Never sourced from an inbound browser request header - see
  // docs/architecture/web-authentication.md's proxy/IP trust section.
  readonly testOnlyForwardedFor?: string;
}

type PostJsonResult =
  { status: number; json: unknown } | { status: "network_error" };

/**
 * The narrow surface WebSessionCoordinator depends on. Exists so unit tests can supply
 * an in-memory fake instead of BackendAuthClient's real fetch/timeout machinery.
 */
export interface AuthBackendPort {
  login(
    username: string,
    password: string,
    ip?: ClientIpOverride,
  ): Promise<LoginOutcome>;
  refresh(refreshToken: string, ip?: ClientIpOverride): Promise<RefreshOutcome>;
  logout(refreshToken: string): Promise<boolean>;
  getMe(accessToken: string): Promise<MeOutcome>;
}

/**
 * The only thing in this module allowed to talk to Backend V2's auth surface. Every
 * caller works in terms of the typed outcomes above, never raw HTTP status codes -
 * that classification lives here so it happens exactly once (see the issue audit's
 * refresh-outcome-classification problem).
 */
export class BackendAuthClient implements AuthBackendPort {
  private readonly baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl ?? getWebAuthConfig().backendBaseUrl;
  }

  async login(
    username: string,
    password: string,
    ip?: ClientIpOverride,
  ): Promise<LoginOutcome> {
    const result = await this.postJson(
      "/api/v2/auth/login",
      { username, password },
      ip,
    );
    return this.toCredentialOutcome(result, "invalid_credentials");
  }

  async refresh(
    refreshToken: string,
    ip?: ClientIpOverride,
  ): Promise<RefreshOutcome> {
    const result = await this.postJson(
      "/api/v2/auth/refresh",
      { refreshToken },
      ip,
    );
    return this.toCredentialOutcome(result, "invalid");
  }

  /** Best-effort: never throws. Backend V2 logout failure must not block local invalidation. */
  async logout(refreshToken: string): Promise<boolean> {
    try {
      const response = await this.fetchWithTimeout("/api/v2/auth/logout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async getMe(accessToken: string): Promise<MeOutcome> {
    try {
      const response = await this.fetchWithTimeout("/api/v2/me", {
        method: "GET",
        headers: { authorization: `Bearer ${accessToken}` },
      });
      if (response.status === 401) {
        return { kind: "unauthorized" };
      }
      if (!response.ok) {
        return { kind: "unavailable" };
      }
      const account = (await response.json()) as CurrentAccountResponseDto;
      return { kind: "success", account };
    } catch {
      // Transient/dependency-unavailable, not an auth failure - see Problem 6.
      return { kind: "unavailable" };
    }
  }

  private toCredentialOutcome<TInvalidKind extends string>(
    result: PostJsonResult,
    invalidKind: TInvalidKind,
  ):
    | { kind: "success"; credentials: AccessTokenResponseDto }
    | { kind: TInvalidKind }
    | { kind: "rate_limited" }
    | { kind: "unknown_failure" } {
    if (result.status === "network_error") {
      return { kind: "unknown_failure" };
    }
    if (result.status === 200) {
      return {
        kind: "success",
        credentials: result.json as AccessTokenResponseDto,
      };
    }
    if (result.status === 401) {
      return { kind: invalidKind };
    }
    if (result.status === 429) {
      return { kind: "rate_limited" };
    }
    // Ambiguous 5xx or anything else unexpected - never treated as a confirmed
    // invalid/rotated credential. See Problem 4/5.
    return { kind: "unknown_failure" };
  }

  private async postJson(
    path: string,
    body: unknown,
    ip?: ClientIpOverride,
  ): Promise<PostJsonResult> {
    try {
      const response = await this.fetchWithTimeout(path, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(ip?.testOnlyForwardedFor
            ? { "x-forwarded-for": ip.testOnlyForwardedFor }
            : {}),
        },
        body: JSON.stringify(body),
      });
      const json =
        response.status === 204
          ? null
          : await response.json().catch(() => null);
      return { status: response.status, json };
    } catch {
      return { status: "network_error" };
    }
  }

  private fetchWithTimeout(path: string, init: RequestInit): Promise<Response> {
    return fetch(`${this.baseUrl}${path}`, {
      ...init,
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  }
}

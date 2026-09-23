import "server-only";
import * as accountResource from "../backend-v2/resources/account";
import * as authResource from "../backend-v2/resources/auth";
import type {
  BackendCredentials,
  CurrentAccount,
} from "../backend-v2/contracts";
import type {
  ClientIpOverride,
  TransportResult,
} from "../backend-v2/transport";

export type { ClientIpOverride } from "../backend-v2/transport";

/** Wire shape of Backend V2's AccessTokenResponseDto - a derivation of the generated contract. */
export type AccessTokenResponseDto = BackendCredentials;

/** Wire shape of Backend V2's CurrentAccountResponseDto - a derivation of the generated contract. */
export type CurrentAccountResponseDto = CurrentAccount;

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

function toCredentialOutcome<TInvalidKind extends string>(
  result: TransportResult<AccessTokenResponseDto>,
  invalidKind: TInvalidKind,
):
  | { kind: "success"; credentials: AccessTokenResponseDto }
  | { kind: TInvalidKind }
  | { kind: "rate_limited" }
  | { kind: "unknown_failure" } {
  if (result.kind === "success") {
    return { kind: "success", credentials: result.data };
  }
  if (result.error.kind === "http" && result.error.httpStatus === 401) {
    return { kind: invalidKind };
  }
  if (result.error.kind === "http" && result.error.httpStatus === 429) {
    return { kind: "rate_limited" };
  }
  // Ambiguous 5xx, timeout, network failure, cancellation, or an unparseable success body -
  // never treated as a confirmed invalid/rotated credential. See the issue #3 audit's Problem
  // 4/5.
  return { kind: "unknown_failure" };
}

/**
 * The only thing in this module allowed to talk to Backend V2's auth surface. Every
 * caller works in terms of the typed outcomes above, never raw HTTP status codes -
 * that classification lives here so it happens exactly once (see the issue audit's
 * refresh-outcome-classification problem). Internally, every call goes through the shared
 * Backend V2 transport (src/lib/backend-v2/transport.ts) via the auth/account resource clients
 * (issue #4) - this class's only remaining job is mapping their normalized results onto the
 * exact LoginOutcome/RefreshOutcome/MeOutcome semantics WebSessionCoordinator already depends
 * on, unchanged since issue #3.
 */
export class BackendAuthClient implements AuthBackendPort {
  // Passed straight through to the transport as a per-call override; undefined means "use
  // LEVEL5_V2_API_BASE_URL" (see transport.ts). Kept as an instance field for
  // BackendAuthClient(baseUrl) construction compatibility - tests and the live-backend
  // certification harness both instantiate it with an explicit base URL.
  private readonly baseUrl: string | undefined;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl;
  }

  async login(
    username: string,
    password: string,
    ip?: ClientIpOverride,
  ): Promise<LoginOutcome> {
    const result = await authResource.login(
      username,
      password,
      ip,
      this.baseUrl,
    );
    return toCredentialOutcome(result, "invalid_credentials");
  }

  async refresh(
    refreshToken: string,
    ip?: ClientIpOverride,
  ): Promise<RefreshOutcome> {
    const result = await authResource.refresh(refreshToken, ip, this.baseUrl);
    return toCredentialOutcome(result, "invalid");
  }

  /** Best-effort: never throws. Backend V2 logout failure must not block local invalidation. */
  async logout(refreshToken: string): Promise<boolean> {
    const result = await authResource.logout(refreshToken, this.baseUrl);
    return result.kind === "success";
  }

  async getMe(accessToken: string): Promise<MeOutcome> {
    const result = await accountResource.getCurrentAccount(
      accessToken,
      undefined,
      this.baseUrl,
    );
    if (result.kind === "success") {
      return { kind: "success", account: result.data };
    }
    if (result.error.kind === "http" && result.error.httpStatus === 401) {
      return { kind: "unauthorized" };
    }
    // Transient/dependency-unavailable, not an auth failure - see issue #3 audit's Problem 6.
    return { kind: "unavailable" };
  }
}

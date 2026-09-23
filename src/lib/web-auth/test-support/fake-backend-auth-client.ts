import type {
  AccessTokenResponseDto,
  AuthBackendPort,
  ClientIpOverride,
  CurrentAccountResponseDto,
  LoginOutcome,
  MeOutcome,
  RefreshOutcome,
  RegisterOutcome,
} from "../backend-auth-client";

/** In-memory double for AuthBackendPort so coordinator tests never touch real HTTP. */
export class FakeBackendAuthClient implements AuthBackendPort {
  registerCallCount = 0;
  loginCallCount = 0;
  refreshCallCount = 0;
  logoutCallCount = 0;
  getMeCallCount = 0;

  registerImpl: (
    username: string,
    password: string,
    displayName: string,
  ) => RegisterOutcome | Promise<RegisterOutcome> = () => ({
    kind: "unknown_failure",
  });
  loginImpl: (
    username: string,
    password: string,
  ) => LoginOutcome | Promise<LoginOutcome> = () => ({
    kind: "unknown_failure",
  });
  refreshImpl: (
    refreshToken: string,
  ) => RefreshOutcome | Promise<RefreshOutcome> = () => ({
    kind: "unknown_failure",
  });
  logoutImpl: (refreshToken: string) => boolean | Promise<boolean> = () => true;
  getMeImpl: (accessToken: string) => MeOutcome | Promise<MeOutcome> = () => ({
    kind: "unavailable",
  });

  async register(
    username: string,
    password: string,
    displayName: string,
    _ip?: ClientIpOverride,
  ): Promise<RegisterOutcome> {
    this.registerCallCount += 1;
    return this.registerImpl(username, password, displayName);
  }

  async login(
    username: string,
    password: string,
    _ip?: ClientIpOverride,
  ): Promise<LoginOutcome> {
    this.loginCallCount += 1;
    return this.loginImpl(username, password);
  }

  async refresh(
    refreshToken: string,
    _ip?: ClientIpOverride,
  ): Promise<RefreshOutcome> {
    this.refreshCallCount += 1;
    return this.refreshImpl(refreshToken);
  }

  async logout(refreshToken: string): Promise<boolean> {
    this.logoutCallCount += 1;
    return this.logoutImpl(refreshToken);
  }

  async getMe(accessToken: string): Promise<MeOutcome> {
    this.getMeCallCount += 1;
    return this.getMeImpl(accessToken);
  }
}

export function fakeCredentials(
  overrides: Partial<AccessTokenResponseDto> = {},
): AccessTokenResponseDto {
  return {
    accessToken: "access-token-1",
    expiresAt: new Date(Date.now() + 900_000).toISOString(),
    playerId: "11111111-1111-1111-1111-111111111111",
    refreshToken: "refresh-token-1",
    refreshTokenExpiresAt: new Date(Date.now() + 2_592_000_000).toISOString(),
    ...overrides,
  };
}

export function fakeAccount(
  overrides: Partial<CurrentAccountResponseDto> = {},
): CurrentAccountResponseDto {
  return {
    accountId: "22222222-2222-2222-2222-222222222222",
    username: "player1",
    status: "Active",
    playerId: "11111111-1111-1111-1111-111111111111",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { request } from "@/lib/backend-v2/transport";
import { resolveTrustedClientIp } from "./trusted-client-ip";

/**
 * Local certification (issue #10) for the trusted-client-IP contract, exercised through the same
 * two functions a real register/login/refresh/logout call site uses (resolveTrustedClientIp then
 * transport.request), rather than each in isolation. What this can and can't prove is documented
 * inline below - the deployment-side half of the contract (the edge stripping/overwriting the
 * configured header) has no local stand-in and stays deployment-dependent (see
 * docs/operations/frontend-production.md).
 */
describe("trusted client IP certification", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  function forwardedForSentToBackend(): string | null {
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    return new Headers(init.headers).get("x-forwarded-for");
  }

  it("a spoofed inbound X-Forwarded-For never reaches Backend V2 when no trusted-edge header is configured", async () => {
    // No LEVEL5_TRUSTED_CLIENT_IP_HEADER set - the production-default, and the state of an
    // environment where no edge/proxy contract has been established yet.
    const inboundHeaders = new Headers({
      "x-forwarded-for": "203.0.113.7", // attacker-supplied, unrelated to the real client
    });

    const clientIp = resolveTrustedClientIp(inboundHeaders);
    expect(clientIp).toBeUndefined();

    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
    await request({
      method: "POST",
      path: "/api/v2/auth/login",
      operationName: "auth.login",
      baseUrl: "http://backend.test",
      ip: clientIp ? { clientIp } : undefined,
    });

    expect(forwardedForSentToBackend()).toBeNull();
  });

  it("a spoofed inbound X-Forwarded-For cannot impersonate the trusted edge header either", async () => {
    vi.stubEnv("LEVEL5_TRUSTED_CLIENT_IP_HEADER", "x-real-client-ip");
    // The attacker controls X-Forwarded-For but not the configured edge header - simulates an
    // edge that hasn't stripped the client-supplied copy of x-forwarded-for (it was never the
    // trusted header to begin with, so this must have no effect either way).
    const inboundHeaders = new Headers({
      "x-forwarded-for": "203.0.113.7",
    });

    const clientIp = resolveTrustedClientIp(inboundHeaders);
    expect(clientIp).toBeUndefined();

    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
    await request({
      method: "POST",
      path: "/api/v2/auth/login",
      operationName: "auth.login",
      baseUrl: "http://backend.test",
      ip: clientIp ? { clientIp } : undefined,
    });

    expect(forwardedForSentToBackend()).toBeNull();
  });

  it("the trusted edge's own header reaches Backend V2 as X-Forwarded-For", async () => {
    vi.stubEnv("LEVEL5_TRUSTED_CLIENT_IP_HEADER", "x-real-client-ip");
    // What a correctly-configured edge is expected to send: the real client address on the one
    // configured header, with any client-supplied x-forwarded-for already stripped/overwritten
    // before this process ever sees the request (that stripping step itself is not exercised
    // here - it's a property of the deployment's edge, not of this code).
    const inboundHeaders = new Headers({
      "x-real-client-ip": "198.51.100.42",
    });

    const clientIp = resolveTrustedClientIp(inboundHeaders);
    expect(clientIp).toBe("198.51.100.42");

    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
    await request({
      method: "POST",
      path: "/api/v2/auth/login",
      operationName: "auth.login",
      baseUrl: "http://backend.test",
      ip: clientIp ? { clientIp } : undefined,
    });

    expect(forwardedForSentToBackend()).toBe("198.51.100.42");
  });
});

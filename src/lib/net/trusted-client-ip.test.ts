import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveTrustedClientIp } from "./trusted-client-ip";

beforeEach(() => {
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("resolveTrustedClientIp", () => {
  it("returns undefined when no header is configured, regardless of inbound headers", () => {
    const headers = new Headers({ "x-forwarded-for": "203.0.113.7" });
    expect(resolveTrustedClientIp(headers)).toBeUndefined();
  });

  it("never falls back to raw X-Forwarded-For, even when configured for a different header", () => {
    vi.stubEnv("LEVEL5_TRUSTED_CLIENT_IP_HEADER", "x-real-client-ip");
    const headers = new Headers({ "x-forwarded-for": "203.0.113.7" });
    expect(resolveTrustedClientIp(headers)).toBeUndefined();
  });

  it("never reads Host or X-Forwarded-Host as a substitute", () => {
    vi.stubEnv("LEVEL5_TRUSTED_CLIENT_IP_HEADER", "x-real-client-ip");
    const headers = new Headers({
      host: "203.0.113.7",
      "x-forwarded-host": "203.0.113.7",
    });
    expect(resolveTrustedClientIp(headers)).toBeUndefined();
  });

  it("resolves a valid IPv4 address from the configured header", () => {
    vi.stubEnv("LEVEL5_TRUSTED_CLIENT_IP_HEADER", "x-real-client-ip");
    const headers = new Headers({ "x-real-client-ip": "203.0.113.7" });
    expect(resolveTrustedClientIp(headers)).toBe("203.0.113.7");
  });

  it("resolves a valid IPv6 address from the configured header", () => {
    vi.stubEnv("LEVEL5_TRUSTED_CLIENT_IP_HEADER", "x-real-client-ip");
    const headers = new Headers({ "x-real-client-ip": "2001:db8::1" });
    expect(resolveTrustedClientIp(headers)).toBe("2001:db8::1");
  });

  it("returns undefined when the configured header is absent", () => {
    vi.stubEnv("LEVEL5_TRUSTED_CLIENT_IP_HEADER", "x-real-client-ip");
    const headers = new Headers();
    expect(resolveTrustedClientIp(headers)).toBeUndefined();
  });

  it("rejects a comma-separated list rather than guessing which hop is real", () => {
    vi.stubEnv("LEVEL5_TRUSTED_CLIENT_IP_HEADER", "x-real-client-ip");
    const headers = new Headers({
      "x-real-client-ip": "203.0.113.7, 198.51.100.9",
    });
    expect(resolveTrustedClientIp(headers)).toBeUndefined();
  });

  it("rejects a non-IP value", () => {
    vi.stubEnv("LEVEL5_TRUSTED_CLIENT_IP_HEADER", "x-real-client-ip");
    const headers = new Headers({ "x-real-client-ip": "not-an-ip" });
    expect(resolveTrustedClientIp(headers)).toBeUndefined();
  });

  it("rejects an empty configured header value", () => {
    vi.stubEnv("LEVEL5_TRUSTED_CLIENT_IP_HEADER", "x-real-client-ip");
    const headers = new Headers({ "x-real-client-ip": "   " });
    expect(resolveTrustedClientIp(headers)).toBeUndefined();
  });

  it("trims surrounding whitespace on an otherwise valid value", () => {
    vi.stubEnv("LEVEL5_TRUSTED_CLIENT_IP_HEADER", "x-real-client-ip");
    const headers = new Headers({ "x-real-client-ip": "  203.0.113.7  " });
    expect(resolveTrustedClientIp(headers)).toBe("203.0.113.7");
  });
});

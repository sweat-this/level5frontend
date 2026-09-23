import "server-only";

/**
 * The single place that talks HTTP to Backend V2. Owns cross-cutting request/response concerns
 * only (serialization, timeouts, retry, ProblemDetails normalization, trace forwarding) - never
 * session refresh coordination, friendship/correspondence rules, or UI messages. See issue #4.
 *
 * BackendAuthClient (src/lib/web-auth/backend-auth-client.ts) and the resource clients under
 * ./resources are the only callers. WebSessionCoordinator never depends on this module, or on
 * HTTP status codes/ProblemDetails/retry behavior directly - see AuthBackendPort.
 */

// Comfortably longer than any single Backend V2 request should take, short enough that a stuck
// backend fails fast instead of pinning a refresh lease's whole budget on one call. Preserves
// the issue #3 invariant: this must stay under WebSessionCoordinator's refresh lease (10s).
export const DEFAULT_TIMEOUT_MS = 5000;

// Retry-After (or a computed backoff delay) is never honored past this, so a misbehaving or
// malicious Retry-After value can't stall a caller far beyond the ordinary request timeout.
const MAX_RETRY_DELAY_MS = 3000;

export interface ClientIpOverride {
  // Test-only: injects a trusted synthetic client IP as X-Forwarded-For so Backend V2's existing
  // KnownProxies/KnownNetworks trust model can be exercised in certification. Never sourced from
  // an inbound browser request header - see docs/architecture/web-authentication.md.
  readonly testOnlyForwardedFor?: string;
}

/** W3C Trace Context - forwarded verbatim when supplied and well-formed. Never invented here. */
export interface TraceContext {
  readonly traceparent?: string;
  readonly tracestate?: string;
}

export interface RetryPolicy {
  // Total attempts including the first, e.g. 3 = 1 initial try + up to 2 retries.
  readonly maxAttempts: number;
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
}

/**
 * For safe (read) operations only - see issue #11. Never applied automatically; each resource
 * client opts in per-operation, and mutations never pass a retry policy at all.
 */
export const SAFE_READ_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 200,
  maxDelayMs: MAX_RETRY_DELAY_MS,
};

export interface RequestOptions {
  readonly method: "GET" | "POST" | "PATCH" | "DELETE";
  readonly path: string;
  readonly body?: unknown;
  readonly accessToken?: string;
  readonly ip?: ClientIpOverride;
  readonly trace?: TraceContext;
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
  // Absent (the default) means no automatic retry - see issue #11. Only ever set by a resource
  // client's read operations.
  readonly retry?: RetryPolicy;
  // Overrides LEVEL5_V2_API_BASE_URL for this call. Only BackendAuthClient uses this - it keeps
  // issue #3's per-instance baseUrl constructor (used by tests and the live-backend
  // certification harness) working unchanged.
  readonly baseUrl?: string;
}

export type TransportError =
  | {
      readonly kind: "http";
      readonly httpStatus: number;
      readonly code?: string;
      readonly safeMessage: string;
      readonly traceId?: string;
      readonly fieldErrors?: Readonly<Record<string, readonly string[]>>;
      readonly retryAfterMs?: number;
    }
  | { readonly kind: "timeout" }
  | { readonly kind: "network" }
  | { readonly kind: "invalid_response"; readonly httpStatus: number }
  // Distinct from "network"/"timeout" on purpose - see issue #10: caller cancellation must never
  // be treated as an ordinary retryable failure.
  | { readonly kind: "cancelled" };

export type TransportResult<T> =
  | { readonly kind: "success"; readonly status: number; readonly data: T }
  | { readonly kind: "error"; readonly error: TransportError };

/** Raw response envelope, decoded from bytes but not yet interpreted as success or failure. */
interface RawResponse {
  readonly status: number;
  readonly headers: Headers;
  readonly bodyText: string;
}

function backendBaseUrl(): string {
  const url = process.env.LEVEL5_V2_API_BASE_URL;
  if (!url) {
    throw new Error("LEVEL5_V2_API_BASE_URL is not configured.");
  }
  return url;
}

// W3C Trace Context traceparent: version-traceid-parentid-flags, each a fixed-length lowercase
// hex field. Malformed values are dropped rather than forwarded - see issue #14.
const TRACEPARENT_PATTERN =
  /^[0-9a-f]{2}-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/;

function traceHeaders(trace: TraceContext | undefined): Record<string, string> {
  if (!trace?.traceparent || !TRACEPARENT_PATTERN.test(trace.traceparent)) {
    return {};
  }
  const headers: Record<string, string> = { traceparent: trace.traceparent };
  // tracestate is opaque (vendor key-value pairs) - forwarded as-is once traceparent is valid,
  // never synthesized. Arbitrary `baggage` is deliberately never forwarded (issue #14).
  if (trace.tracestate) {
    headers.tracestate = trace.tracestate;
  }
  return headers;
}

function isValidRetryAfterMs(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, MAX_RETRY_DELAY_MS);
  }
  const dateMs = Date.parse(value);
  if (!Number.isNaN(dateMs)) {
    const deltaMs = dateMs - Date.now();
    return deltaMs > 0 ? Math.min(deltaMs, MAX_RETRY_DELAY_MS) : 0;
  }
  return undefined;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jitteredBackoff(policy: RetryPolicy, attempt: number): number {
  const exponential = policy.baseDelayMs * 2 ** (attempt - 1);
  const capped = Math.min(exponential, policy.maxDelayMs);
  return Math.random() * capped;
}

const GENERIC_SAFE_MESSAGE = "The request could not be completed.";

interface ParsedProblem {
  readonly code?: string;
  readonly safeMessage: string;
  readonly traceId?: string;
  readonly fieldErrors?: Record<string, readonly string[]>;
}

/**
 * Defensively interprets a non-2xx body as RFC 7807 ProblemDetails. Backend V2's ApiExceptionHandler
 * always sets a client-safe `title` (a generic fixed string for 500s, never raw exception detail -
 * see ApiExceptionHandler.cs), so `title` is safe to surface once JSON parsing has actually
 * succeeded. Anything that isn't parseable JSON with that shape - empty body, plain text, HTML
 * from a reverse proxy, a transport-level 401/429/503 with no body - falls back to a generic
 * message instead. This never throws: a malformed body degrades to the generic message, it never
 * produces a second failure on top of the original one.
 */
function parseProblemDetails(raw: RawResponse): ParsedProblem {
  const contentType = raw.headers.get("content-type") ?? "";

  // Backend V2 only ever puts traceId inside the ProblemDetails JSON body (see
  // ApiExceptionHandler.cs) - there is no response header to fall back to, and none is invented
  // here (issue #14: no custom correlation protocol).
  if (!raw.bodyText || !contentType.includes("json")) {
    return { safeMessage: GENERIC_SAFE_MESSAGE };
  }

  try {
    const parsed: unknown = JSON.parse(raw.bodyText);
    if (typeof parsed !== "object" || parsed === null) {
      return { safeMessage: GENERIC_SAFE_MESSAGE };
    }
    const problem = parsed as Record<string, unknown>;

    const code = typeof problem.code === "string" ? problem.code : undefined;
    const traceId =
      typeof problem.traceId === "string" ? problem.traceId : undefined;
    const safeMessage =
      typeof problem.title === "string" && problem.title.length > 0
        ? problem.title
        : GENERIC_SAFE_MESSAGE;

    const fieldErrors = isFieldErrorsShape(problem.errors)
      ? problem.errors
      : undefined;

    return { code, safeMessage, traceId, fieldErrors };
  } catch {
    return { safeMessage: GENERIC_SAFE_MESSAGE };
  }
}

function isFieldErrorsShape(
  value: unknown,
): value is Record<string, readonly string[]> {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  return Object.values(value).every(
    (entry) =>
      Array.isArray(entry) && entry.every((item) => typeof item === "string"),
  );
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 502 || status === 503 || status === 504;
}

/** One HTTP attempt: fetch, classify transport-level failures, never throws. */
async function attempt(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  callerSignal: AbortSignal | undefined,
): Promise<
  | { kind: "response"; raw: RawResponse }
  | { kind: "timeout" }
  | { kind: "network" }
  | { kind: "cancelled" }
> {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const signal = callerSignal
    ? AbortSignal.any([callerSignal, timeoutSignal])
    : timeoutSignal;

  try {
    const response = await fetch(url, { ...init, cache: "no-store", signal });
    const bodyText = await response.text().catch(() => "");
    return {
      kind: "response",
      raw: { status: response.status, headers: response.headers, bodyText },
    };
  } catch (error) {
    if (callerSignal?.aborted) {
      return { kind: "cancelled" };
    }
    if (timeoutSignal.aborted) {
      return { kind: "timeout" };
    }
    // DOMException("TimeoutError")/AbortError can also surface here if the runtime doesn't
    // reflect .aborted synchronously - name-sniff as a fallback, never as the primary check.
    if (
      error instanceof DOMException &&
      (error.name === "TimeoutError" || error.name === "AbortError")
    ) {
      return { kind: "timeout" };
    }
    return { kind: "network" };
  }
}

/**
 * Executes one Backend V2 request and returns a normalized result - never throws. Retries only
 * when `options.retry` is explicitly supplied (safe reads only - see issue #11), and never
 * retries past caller cancellation (issue #10).
 */
export async function request<T>(
  options: RequestOptions,
): Promise<TransportResult<T>> {
  const url = `${options.baseUrl ?? backendBaseUrl()}${options.path}`;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const headers: Record<string, string> = {
    ...traceHeaders(options.trace),
    ...(options.ip?.testOnlyForwardedFor
      ? { "x-forwarded-for": options.ip.testOnlyForwardedFor }
      : {}),
    ...(options.accessToken
      ? { authorization: `Bearer ${options.accessToken}` }
      : {}),
  };
  if (options.body !== undefined) {
    headers["content-type"] = "application/json";
  }

  const init: RequestInit = {
    method: options.method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  };

  const maxAttempts = options.retry?.maxAttempts ?? 1;
  let lastNonRetryable: TransportResult<T> | null = null;

  for (let attemptNumber = 1; attemptNumber <= maxAttempts; attemptNumber++) {
    const outcome = await attempt(url, init, timeoutMs, options.signal);

    if (outcome.kind === "cancelled") {
      return { kind: "error", error: { kind: "cancelled" } };
    }
    if (outcome.kind === "timeout") {
      return { kind: "error", error: { kind: "timeout" } };
    }
    if (outcome.kind === "network") {
      if (options.retry && attemptNumber < maxAttempts) {
        await delay(jitteredBackoff(options.retry, attemptNumber));
        continue;
      }
      return { kind: "error", error: { kind: "network" } };
    }

    const { raw } = outcome;
    if (raw.status >= 200 && raw.status < 300) {
      return decodeSuccess<T>(raw);
    }

    const problem = parseProblemDetails(raw);
    const retryAfterMs = isValidRetryAfterMs(raw.headers.get("retry-after"));
    const result: TransportResult<T> = {
      kind: "error",
      error: {
        kind: "http",
        httpStatus: raw.status,
        code: problem.code,
        safeMessage: problem.safeMessage,
        traceId: problem.traceId,
        fieldErrors: problem.fieldErrors,
        retryAfterMs,
      },
    };

    const canRetry =
      options.retry !== undefined &&
      attemptNumber < maxAttempts &&
      (isRetryableStatus(raw.status) ||
        (raw.status === 429 && retryAfterMs !== undefined));
    if (canRetry) {
      lastNonRetryable = result;
      await delay(
        retryAfterMs ?? jitteredBackoff(options.retry!, attemptNumber),
      );
      continue;
    }
    return result;
  }

  // Unreachable in practice (the loop always returns), but keeps the function total.
  return lastNonRetryable ?? { kind: "error", error: { kind: "network" } };
}

function decodeSuccess<T>(raw: RawResponse): TransportResult<T> {
  if (raw.status === 204 || raw.bodyText.length === 0) {
    // No body expected/received - callers that need a payload here get `undefined`, which only
    // type-checks as T when the resource client declared a void/undefined success type.
    return { kind: "success", status: raw.status, data: undefined as T };
  }

  const contentType = raw.headers.get("content-type") ?? "";
  if (!contentType.includes("json")) {
    return {
      kind: "error",
      error: { kind: "invalid_response", httpStatus: raw.status },
    };
  }

  try {
    const data = JSON.parse(raw.bodyText) as T;
    return { kind: "success", status: raw.status, data };
  } catch {
    return {
      kind: "error",
      error: { kind: "invalid_response", httpStatus: raw.status },
    };
  }
}

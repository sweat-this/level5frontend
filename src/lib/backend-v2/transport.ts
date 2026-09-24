import "server-only";
import { SpanStatusCode } from "@opentelemetry/api";
import { tracer } from "@/lib/otel/telemetry";

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
  // The real, trusted-edge-resolved client IP (issue #10) - see
  // src/lib/net/trusted-client-ip.ts. Only ever sourced from the one configured trusted edge
  // header, never raw/inbound X-Forwarded-For.
  readonly clientIp?: string;
  // Test-only: injects a synthetic client IP as X-Forwarded-For so Backend V2's existing
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
  // A stable, low-cardinality identifier (e.g. "players.getByTag") for this call's telemetry
  // span/metrics (issue #10) - `path` alone isn't safe to use directly, since several resource
  // paths embed a series ID/Player Tag/player ID. Every resource client call supplies this.
  readonly operationName: string;
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

interface AttemptedResult<T> {
  readonly result: TransportResult<T>;
  // Total attempts actually made (1 = no retry occurred) - reported as a span attribute, issue #10.
  readonly attempts: number;
}

/**
 * The retry loop itself, unchanged from before issue #10 - split out only so request() can wrap
 * it in a span and record attempt count/outcome as attributes without an early `return` inside
 * the loop skipping that bookkeeping.
 */
async function executeWithRetry<T>(
  options: RequestOptions,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<AttemptedResult<T>> {
  const maxAttempts = options.retry?.maxAttempts ?? 1;
  let lastNonRetryable: TransportResult<T> | null = null;

  for (let attemptNumber = 1; attemptNumber <= maxAttempts; attemptNumber++) {
    const outcome = await attempt(url, init, timeoutMs, options.signal);

    if (outcome.kind === "cancelled") {
      return {
        result: { kind: "error", error: { kind: "cancelled" } },
        attempts: attemptNumber,
      };
    }
    if (outcome.kind === "timeout") {
      return {
        result: { kind: "error", error: { kind: "timeout" } },
        attempts: attemptNumber,
      };
    }
    if (outcome.kind === "network") {
      if (options.retry && attemptNumber < maxAttempts) {
        await delay(jitteredBackoff(options.retry, attemptNumber));
        continue;
      }
      return {
        result: { kind: "error", error: { kind: "network" } },
        attempts: attemptNumber,
      };
    }

    const { raw } = outcome;
    if (raw.status >= 200 && raw.status < 300) {
      return { result: decodeSuccess<T>(raw), attempts: attemptNumber };
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
    return { result, attempts: attemptNumber };
  }

  // Unreachable in practice (the loop always returns), but keeps the function total.
  return {
    result: lastNonRetryable ?? { kind: "error", error: { kind: "network" } },
    attempts: maxAttempts,
  };
}

function outcomeAttribute<T>(result: TransportResult<T>): string {
  return result.kind === "success" ? "success" : result.error.kind;
}

function statusCodeAttribute<T>(
  result: TransportResult<T>,
): number | undefined {
  if (result.kind === "success") {
    return result.status;
  }
  if (
    result.error.kind === "http" ||
    result.error.kind === "invalid_response"
  ) {
    return result.error.httpStatus;
  }
  return undefined;
}

/**
 * Executes one Backend V2 request and returns a normalized result - never throws. Retries only
 * when `options.retry` is explicitly supplied (safe reads only - see issue #11), and never
 * retries past caller cancellation (issue #10).
 *
 * Wrapped in a span named for `options.operationName` (never the raw `path`, which can embed a
 * series ID/Player Tag/player ID - issue #10's low-cardinality requirement) recording duration,
 * outcome, status code, and retry count. The actual fetch() call(s) inside get the same
 * `operationName` and `propagateContext: true` via the `opentelemetry` RequestInit option (see
 * @vercel/otel's fetch instrumentation) - each attempt becomes its own child span, and Backend
 * V2's ASP.NET trace picks up the same W3C trace context automatically.
 */
export async function request<T>(
  options: RequestOptions,
): Promise<TransportResult<T>> {
  // options.path always starts with "/" - strip any trailing slash from the base so a
  // LEVEL5_V2_API_BASE_URL configured with one (e.g. "https://backend.example.com/") can never
  // produce a malformed "//api/..." URL.
  const base = (options.baseUrl ?? backendBaseUrl()).replace(/\/$/, "");
  const url = `${base}${options.path}`;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  // clientIp (real, trusted-edge-resolved) takes priority; testOnlyForwardedFor only exists for
  // certification harnesses that don't run behind a real edge. A caller should never supply both.
  const forwardedFor = options.ip?.clientIp ?? options.ip?.testOnlyForwardedFor;
  const headers: Record<string, string> = {
    ...traceHeaders(options.trace),
    ...(forwardedFor ? { "x-forwarded-for": forwardedFor } : {}),
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
    opentelemetry: {
      spanName: `backend.${options.operationName}.fetch`,
      propagateContext: true,
      // @vercel/otel's fetch auto-instrumentation otherwise attaches the full request URL
      // (including path) as the http.url/resource.name span attributes - several resource paths
      // embed a series ID/Player Tag/player ID, which must never become a span attribute any
      // more than it may become a metric dimension (see this function's own doc comment). `base`
      // (origin only, no path) is never sensitive; operationName is already the low-cardinality
      // identifier used for the span name itself.
      attributes: {
        "http.url": base,
        "resource.name": options.operationName,
      },
    },
  };

  return tracer.startActiveSpan(
    `backend.${options.operationName}`,
    async (span) => {
      try {
        const { result, attempts } = await executeWithRetry<T>(
          options,
          url,
          init,
          timeoutMs,
        );
        span.setAttribute("backend.operation", options.operationName);
        span.setAttribute("backend.retry_count", attempts - 1);
        span.setAttribute("backend.outcome", outcomeAttribute(result));
        const statusCode = statusCodeAttribute(result);
        if (statusCode !== undefined) {
          span.setAttribute("http.status_code", statusCode);
        }
        span.setStatus({
          code:
            result.kind === "success"
              ? SpanStatusCode.OK
              : SpanStatusCode.ERROR,
        });
        return result;
      } finally {
        span.end();
      }
    },
  );
}

function decodeSuccess<T>(raw: RawResponse): TransportResult<T> {
  if (raw.status === 204) {
    // The only status Backend V2 ever sends with an intentionally empty body (logout,
    // accept/decline/cancel/remove - see the resource clients). A 200 is never intentionally
    // empty, so it falls through to the JSON checks below and comes back invalid_response
    // instead of a false "success" with undefined data - see issue #4 review Problem 1: an
    // empty 200 for login/refresh was previously accepted as success, producing a session with
    // Date.parse(undefined) => NaN, which isAccessTokenExpired treats as never-expiring.
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

import "server-only";
import { meter } from "@/lib/otel/telemetry";

/**
 * The full, fixed set of session-infrastructure diagnostic events (issue #5). Deliberately not
 * extensible ad hoc - a narrow enum keeps this compatible with future telemetry (#10) without
 * ever needing a schema migration of its own. Never add a variant whose fields could carry a
 * session id/hash, account/player id, or any credential/key material.
 *
 * login_outcome/register_outcome/refresh_throttled added for issue #10's low-cardinality
 * auth/session outcome counts - each reuses this same fixed-vocabulary, never-PII-bearing
 * contract, not a separate metrics taxonomy.
 */
export type SessionEventName =
  | "session_created"
  | "session_expired"
  | "refresh_success"
  | "refresh_throttled"
  | "refresh_claim_lost"
  | "refresh_invalid"
  | "refresh_outcome_unknown"
  | "session_store_unavailable"
  | "session_record_corrupt"
  | "logout_backend_revoke_failed"
  | "login_outcome"
  | "register_outcome";

// Low-cardinality only: short enum-like strings/booleans/small integers. Never a session id,
// account/player id, token, ciphertext, or key material - see the type doc above.
export type SessionEventFields = Readonly<
  Record<string, string | number | boolean>
>;

// Issue #10: one counter for every session-infrastructure event, `event` (and any other field -
// all already constrained to SessionEventFields' low-cardinality contract above) as attributes.
// Not a separate metrics taxonomy from the existing console.info sink below - the same call site,
// the same vocabulary, a second sink.
const sessionEventCounter = meter.createCounter("level5.session_events", {
  description: "Session-infrastructure diagnostic events, by event name.",
});

/**
 * Structured, narrow logging - not a general telemetry SDK on its own, but as of issue #10 also
 * increments a low-cardinality OTel counter (safe to call unconditionally - see telemetry.ts).
 * `console.info` remains the sink of record for anything needing full-fidelity per-event detail;
 * every call site already goes through this one function, so both sinks stay in lockstep.
 */
export function recordSessionEvent(
  event: SessionEventName,
  fields?: SessionEventFields,
): void {
  sessionEventCounter.add(1, { event, ...fields });

  // `event`/`ts` spread last so a caller-supplied field can never shadow them - e.g. a stray
  // `{ event: "..." }` in `fields` would otherwise silently rewrite the log line's real event
  // name instead of being rejected or ignored.
  console.info(
    JSON.stringify({ ...fields, event, ts: new Date().toISOString() }),
  );
}

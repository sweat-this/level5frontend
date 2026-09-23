import "server-only";

/**
 * The full, fixed set of session-infrastructure diagnostic events (issue #5). Deliberately not
 * extensible ad hoc - a narrow enum keeps this compatible with future telemetry (#10) without
 * ever needing a schema migration of its own. Never add a variant whose fields could carry a
 * session id/hash, account/player id, or any credential/key material.
 */
export type SessionEventName =
  | "session_created"
  | "session_expired"
  | "refresh_success"
  | "refresh_claim_lost"
  | "refresh_invalid"
  | "refresh_outcome_unknown"
  | "session_store_unavailable"
  | "session_record_corrupt"
  | "logout_backend_revoke_failed";

// Low-cardinality only: short enum-like strings/booleans/small integers. Never a session id,
// account/player id, token, ciphertext, or key material - see the type doc above.
export type SessionEventFields = Readonly<
  Record<string, string | number | boolean>
>;

/**
 * Structured, narrow logging - not a general telemetry SDK. `console.info` is enough for this
 * scope; a future observability pass (#10) can swap the sink without touching any call site,
 * since every call site already goes through this one function.
 */
export function recordSessionEvent(
  event: SessionEventName,
  fields?: SessionEventFields,
): void {
  // `event`/`ts` spread last so a caller-supplied field can never shadow them - e.g. a stray
  // `{ event: "..." }` in `fields` would otherwise silently rewrite the log line's real event
  // name instead of being rejected or ignored.
  console.info(
    JSON.stringify({ ...fields, event, ts: new Date().toISOString() }),
  );
}

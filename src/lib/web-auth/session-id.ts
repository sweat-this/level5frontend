import "server-only";
import { createHash, randomBytes } from "node:crypto";

// 256 bits, per the ADR's session-identifier requirement.
const SESSION_ID_BYTES = 32;

/**
 * A cryptographically random opaque identifier for the browser's session cookie. The
 * server-side store never needs this raw value - see hashSessionId.
 */
export function generateSessionId(): string {
  return randomBytes(SESSION_ID_BYTES).toString("base64url");
}

/**
 * The session store's lookup key. Hashing means a store read/leak never yields a value
 * that is itself usable as the browser's session credential.
 */
export function hashSessionId(sessionId: string): string {
  return createHash("sha256").update(sessionId, "utf8").digest("hex");
}

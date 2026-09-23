import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// AES-256-GCM: authenticated encryption, one modern primitive Node's runtime supports natively.
// No plaintext Backend V2 bearer credential may reach RedisWebSessionStore - see
// persisted-web-session.ts, the only caller of encrypt/decrypt.
const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
// 96 bits, the size GCM is defined/optimized for - a longer IV is hashed down internally and
// loses the "never reuse a (key, IV) pair" guarantee a fresh 96-bit value gives for free.
const IV_BYTES = 12;

export interface Keyring {
  readonly activeKeyId: string;
  readonly keys: ReadonlyMap<string, Buffer>;
}

export interface EncryptedEnvelope {
  readonly keyId: string;
  readonly iv: string; // base64
  readonly ciphertext: string; // base64
  readonly authTag: string; // base64
}

export type SessionCryptoErrorReason =
  "unknown_key_id" | "auth_failed" | "invalid_key_config";

/**
 * The only error this module throws. A single class with a `reason` discriminant, not a
 * hierarchy - every failure mode (unknown key, tampered ciphertext/tag, wrong AAD, malformed key
 * material) means the same thing to a caller: this record cannot be trusted, fail closed.
 */
export class SessionCryptoError extends Error {
  readonly reason: SessionCryptoErrorReason;

  constructor(reason: SessionCryptoErrorReason, message: string) {
    super(message);
    this.name = "SessionCryptoError";
    this.reason = reason;
  }
}

function requireKeyBytes(keyId: string, key: Buffer): void {
  if (key.length !== KEY_BYTES) {
    throw new SessionCryptoError(
      "invalid_key_config",
      `Session encryption key "${keyId}" is not ${KEY_BYTES} bytes`,
    );
  }
}

/**
 * Encrypts `plaintext` under the keyring's active key. Always writes with the active key -
 * older keys in the keyring are readable (decrypt) but never written (see the keyring rotation
 * runbook in docs/architecture/web-authentication.md).
 */
export function encrypt(
  plaintext: string,
  keyring: Keyring,
  additionalData: Buffer,
): EncryptedEnvelope {
  const key = keyring.keys.get(keyring.activeKeyId);
  if (!key) {
    throw new SessionCryptoError(
      "invalid_key_config",
      `Active key "${keyring.activeKeyId}" is not present in the keyring`,
    );
  }
  requireKeyBytes(keyring.activeKeyId, key);

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(additionalData);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return {
    keyId: keyring.activeKeyId,
    iv: iv.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    authTag: authTag.toString("base64"),
  };
}

/**
 * Decrypts `envelope`, selecting the key by its stored `keyId` (any readable key in the
 * keyring, not only the active one - this is what makes staged key rotation possible without a
 * background re-encryption job). AAD must match exactly what encrypt() was called with, or GCM's
 * authentication fails the same way a tampered ciphertext/tag would.
 */
export function decrypt(
  envelope: EncryptedEnvelope,
  keyring: Keyring,
  additionalData: Buffer,
): string {
  const key = keyring.keys.get(envelope.keyId);
  if (!key) {
    throw new SessionCryptoError(
      "unknown_key_id",
      "Session record was encrypted with a key not present in this instance's keyring",
    );
  }
  requireKeyBytes(envelope.keyId, key);

  let iv: Buffer;
  let ciphertext: Buffer;
  let authTag: Buffer;
  try {
    iv = Buffer.from(envelope.iv, "base64");
    ciphertext = Buffer.from(envelope.ciphertext, "base64");
    authTag = Buffer.from(envelope.authTag, "base64");
  } catch {
    throw new SessionCryptoError(
      "auth_failed",
      "Session record's encryption envelope is malformed",
    );
  }
  if (iv.length !== IV_BYTES || authTag.length === 0) {
    throw new SessionCryptoError(
      "auth_failed",
      "Session record's encryption envelope is malformed",
    );
  }

  try {
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    decipher.setAAD(additionalData);
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    return plaintext.toString("utf8");
  } catch {
    // node:crypto throws a generic Error on GCM auth-tag mismatch (tampered ciphertext/tag,
    // wrong key, or wrong AAD) - normalized here to the one typed failure this module exposes.
    throw new SessionCryptoError(
      "auth_failed",
      "Session record failed authenticated decryption",
    );
  }
}

// Exported only so session-store-config.ts's validation and this module's own internal checks
// agree on what "a valid key" means without duplicating the constant.
export const SESSION_ENCRYPTION_KEY_BYTES = KEY_BYTES;

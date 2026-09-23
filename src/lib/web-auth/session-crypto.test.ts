import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  decrypt,
  encrypt,
  SessionCryptoError,
  type Keyring,
} from "./session-crypto";

function keyOf(byte: number): Buffer {
  return Buffer.alloc(32, byte);
}

function keyring(activeKeyId: string, keys: Record<string, Buffer>): Keyring {
  return { activeKeyId, keys: new Map(Object.entries(keys)) };
}

const AAD = Buffer.from("1:some-session-hash", "utf8");

describe("session-crypto", () => {
  it("round-trips plaintext through encrypt/decrypt", () => {
    const ring = keyring("k1", { k1: keyOf(1) });
    const envelope = encrypt("secret-payload", ring, AAD);
    expect(decrypt(envelope, ring, AAD)).toBe("secret-payload");
  });

  it("always encrypts under the active key and records its id", () => {
    const ring = keyring("k2", { k1: keyOf(1), k2: keyOf(2) });
    const envelope = encrypt("payload", ring, AAD);
    expect(envelope.keyId).toBe("k2");
  });

  it("uses a fresh IV for every encryption, even of identical plaintext", () => {
    const ring = keyring("k1", { k1: keyOf(1) });
    const a = encrypt("same-plaintext", ring, AAD);
    const b = encrypt("same-plaintext", ring, AAD);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it("fails closed when decrypting with the wrong key", () => {
    const writer = keyring("k1", { k1: keyOf(1) });
    const envelope = encrypt("payload", writer, AAD);
    const wrongKeyRing: Keyring = {
      activeKeyId: "k1",
      keys: new Map([["k1", keyOf(9)]]),
    };
    expect(() => decrypt(envelope, wrongKeyRing, AAD)).toThrow(
      SessionCryptoError,
    );
  });

  it("fails closed on an unknown keyId", () => {
    const envelope = encrypt("payload", keyring("k1", { k1: keyOf(1) }), AAD);
    const readerRing = keyring("k2-only", { "k2-only": keyOf(2) });
    try {
      decrypt(envelope, readerRing, AAD);
      throw new Error("expected decrypt to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(SessionCryptoError);
      expect((err as SessionCryptoError).reason).toBe("unknown_key_id");
    }
  });

  it("fails closed on a tampered ciphertext", () => {
    const ring = keyring("k1", { k1: keyOf(1) });
    const envelope = encrypt("payload", ring, AAD);
    const tampered = {
      ...envelope,
      ciphertext: Buffer.from(
        randomBytes(Buffer.from(envelope.ciphertext, "base64").length),
      ).toString("base64"),
    };
    expect(() => decrypt(tampered, ring, AAD)).toThrow(SessionCryptoError);
  });

  it("fails closed on a tampered authentication tag", () => {
    const ring = keyring("k1", { k1: keyOf(1) });
    const envelope = encrypt("payload", ring, AAD);
    const tampered = {
      ...envelope,
      authTag: Buffer.from(
        randomBytes(Buffer.from(envelope.authTag, "base64").length),
      ).toString("base64"),
    };
    expect(() => decrypt(tampered, ring, AAD)).toThrow(SessionCryptoError);
  });

  it("fails closed when additional data does not match", () => {
    const ring = keyring("k1", { k1: keyOf(1) });
    const envelope = encrypt("payload", ring, AAD);
    const wrongAad = Buffer.from("1:a-different-session-hash", "utf8");
    expect(() => decrypt(envelope, ring, wrongAad)).toThrow(SessionCryptoError);
  });

  it("fails closed on an invalid (wrong-length) key configuration", () => {
    const shortKeyRing: Keyring = {
      activeKeyId: "k1",
      keys: new Map([["k1", Buffer.alloc(16, 1)]]),
    };
    try {
      encrypt("payload", shortKeyRing, AAD);
      throw new Error("expected encrypt to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(SessionCryptoError);
      expect((err as SessionCryptoError).reason).toBe("invalid_key_config");
    }
  });

  it("decrypts with any readable key in the keyring, not only the active one", () => {
    // Staged key rotation: a record written under an old key stays readable once both keys are
    // in the keyring, even after the active key moves on to a new one.
    const writer = keyring("old", { old: keyOf(1) });
    const envelope = encrypt("payload", writer, AAD);

    const rotatedReader = keyring("new", { old: keyOf(1), new: keyOf(2) });
    expect(decrypt(envelope, rotatedReader, AAD)).toBe("payload");
  });
});

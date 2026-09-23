import "server-only";
import { decode, encode } from "./persisted-web-session";
import { recordSessionEvent } from "./session-observability";
import type { Keyring } from "./session-crypto";
import { SessionStoreUnavailableError } from "./session-store-errors";
import type { WebSession } from "./web-session";
import type { WebSessionStore } from "./web-session-store";

const KEY_PREFIX = "level5:web-session:";

// Comfortably under WebSessionCoordinator's 10s refresh lease, and far under
// BackendAuthClient's 5s (transport.ts's DEFAULT_TIMEOUT_MS) - a Redis op that hasn't answered
// in 2s should fail fast rather than eat into either budget.
const DEFAULT_COMMAND_TIMEOUT_MS = 2000;

/**
 * The narrow subset of @redis/client's RedisClientType this store depends on - mirrors the
 * AuthBackendPort/WebSessionStore convention of depending on a small port rather than a
 * concrete client, so fault-injection tests can supply a double without a real Redis. The real
 * client returned by @redis/client's createClient() satisfies this structurally; nothing here
 * constructs one (see session-store-runtime.ts, the only file that does).
 */
export interface RedisSessionClient {
  withAbortSignal(signal: AbortSignal): RedisSessionClient;
  get(key: string): Promise<string | null>;
  set(
    key: string,
    value: string,
    options: {
      condition: "NX";
      expiration: { type: "PXAT"; value: number };
    },
  ): Promise<string | null>;
  eval(
    script: string,
    options: { keys: string[]; arguments: string[] },
  ): Promise<unknown>;
  del(key: string): Promise<number>;
  ping(): Promise<string>;
}

// Static, parameterized Lua CAS script - KEYS/ARGV only, never string-built from session data
// (issue #5's explicit requirement). Corruption is not special-cased here: an undecodable
// record just falls through to a definite miss (0); persisted-web-session.ts's decode() is the
// only place corruption is classified, invoked from find() below.
const CAS_SCRIPT = `
local current = redis.call('GET', KEYS[1])
if not current then
  return 0
end
local ok, decoded = pcall(cjson.decode, current)
if not ok or type(decoded) ~= 'table' or type(decoded.revision) ~= 'number' then
  return 0
end
if tonumber(ARGV[1]) ~= decoded.revision then
  return 0
end
redis.call('SET', KEYS[1], ARGV[2])
redis.call('PEXPIREAT', KEYS[1], tonumber(ARGV[3]))
return 1
`.trim();

function keyFor(sessionIdHash: string): string {
  return `${KEY_PREFIX}${sessionIdHash}`;
}

function toStoreUnavailable(cause: unknown): SessionStoreUnavailableError {
  return new SessionStoreUnavailableError(
    "Redis web-session store operation did not complete",
    { cause },
  );
}

export interface RedisWebSessionStoreOptions {
  readonly now?: () => number;
  readonly commandTimeoutMs?: number;
}

/**
 * Production WebSessionStore backed by a shared Redis instance (issue #5). See
 * docs/architecture/web-authentication.md for the key namespace, persisted schema, CAS, and
 * failure-classification design this implements.
 */
export class RedisWebSessionStore implements WebSessionStore {
  private readonly now: () => number;
  private readonly commandTimeoutMs: number;

  constructor(
    private readonly client: RedisSessionClient,
    private readonly keyring: Keyring,
    options: RedisWebSessionStoreOptions = {},
  ) {
    this.now = options.now ?? Date.now;
    this.commandTimeoutMs =
      options.commandTimeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS;
  }

  private withTimeout(): RedisSessionClient {
    return this.client.withAbortSignal(
      AbortSignal.timeout(this.commandTimeoutMs),
    );
  }

  async create(session: WebSession): Promise<void> {
    const value = encode(session, session.sessionIdHash, this.keyring);
    let result: string | null;
    try {
      result = await this.withTimeout().set(
        keyFor(session.sessionIdHash),
        value,
        {
          condition: "NX",
          expiration: { type: "PXAT", value: session.absoluteExpiresAt },
        },
      );
    } catch (cause) {
      throw toStoreUnavailable(cause);
    }
    if (result === null) {
      // NX collision on a 256-bit random session id is cryptographically negligible - this is a
      // last-resort guard against silently overwriting another session's record, not a case the
      // coordinator is expected to handle.
      throw new Error(
        "Redis already holds a session record for this session id",
      );
    }
  }

  async find(sessionIdHash: string): Promise<WebSession | null> {
    let raw: string | null;
    try {
      raw = await this.withTimeout().get(keyFor(sessionIdHash));
    } catch (cause) {
      throw toStoreUnavailable(cause);
    }
    if (raw === null) {
      return null;
    }

    const result = decode(raw, sessionIdHash, this.keyring, this.now());
    if (result.kind === "corrupt") {
      // "expired" is a legitimate defensive finding (Redis's own TTL should already have evicted
      // this key - see decode()'s doc comment), not a diagnostic worth the same event as a
      // malformed/tampered/unreadable record.
      if (result.reason === "expired") {
        recordSessionEvent("session_expired");
      } else {
        recordSessionEvent("session_record_corrupt", { reason: result.reason });
      }
      await this.bestEffortDelete(sessionIdHash);
      return null;
    }
    return result.session;
  }

  async compareAndSwap(
    sessionIdHash: string,
    expectedRevision: number,
    replacement: WebSession,
  ): Promise<boolean> {
    const value = encode(replacement, sessionIdHash, this.keyring);
    let reply: unknown;
    try {
      reply = await this.withTimeout().eval(CAS_SCRIPT, {
        keys: [keyFor(sessionIdHash)],
        arguments: [
          String(expectedRevision),
          value,
          String(replacement.absoluteExpiresAt),
        ],
      });
    } catch (cause) {
      throw toStoreUnavailable(cause);
    }
    return reply === 1;
  }

  async delete(sessionIdHash: string): Promise<void> {
    try {
      await this.withTimeout().del(keyFor(sessionIdHash));
    } catch (cause) {
      throw toStoreUnavailable(cause);
    }
  }

  /** Used only by /health/ready - see session-store-runtime.ts. */
  async ping(): Promise<void> {
    try {
      await this.withTimeout().ping();
    } catch (cause) {
      throw toStoreUnavailable(cause);
    }
  }

  private async bestEffortDelete(sessionIdHash: string): Promise<void> {
    try {
      await this.withTimeout().del(keyFor(sessionIdHash));
    } catch {
      // Best-effort: a record that can't even be deleted will simply fail decode() again next
      // read, which stays fail-closed (safe) even if it leaves a stale key behind.
    }
  }
}

import "server-only";
import { createClient } from "@redis/client";
import { MemoryWebSessionStore } from "./memory-web-session-store";
import {
  RedisWebSessionStore,
  type RedisSessionClient,
} from "./redis-web-session-store";
import { recordSessionEvent } from "./session-observability";
import { getWebSessionStoreConfig } from "./session-store-config";
import { SessionStoreUnavailableError } from "./session-store-errors";
import type { WebSessionStore } from "./web-session-store";

type RedisClient = ReturnType<typeof createClient>;

interface SessionStoreRuntimeState {
  store: WebSessionStore | null;
  redisClient: RedisClient | null;
  redisConnectPromise: Promise<RedisClient> | null;
}

function createRuntimeState(): SessionStoreRuntimeState {
  return { store: null, redisClient: null, redisConnectPromise: null };
}

// A long-lived Node.js Route Handler process should hold exactly one Redis connection, not one
// per request - Next.js has no built-in singleton-client API of its own. In development, this
// module can be re-evaluated by Fast Refresh/HMR on unrelated file changes without the process
// itself restarting; a plain module-level `let` would then silently orphan the previous Redis
// connection (never disconnected, just unreachable) on every such reload. Stashing the state on
// `globalThis` - the same pattern commonly used for long-lived DB clients under Next.js dev -
// makes it survive module re-evaluation. Production processes aren't hot-reloaded, so this is
// only ever exercised outside production, but it's harmless either way.
const globalForSessionStore = globalThis as typeof globalThis & {
  __level5WebSessionStoreRuntime?: SessionStoreRuntimeState;
};

const state: SessionStoreRuntimeState =
  process.env.NODE_ENV === "production"
    ? createRuntimeState()
    : (globalForSessionStore.__level5WebSessionStoreRuntime ??=
        createRuntimeState());

// The socket-level connectTimeout only bounds one TCP attempt - the client's reconnectStrategy
// then keeps retrying indefinitely without the outer connect() promise ever settling. This
// deadline bounds the *initial* connection attempt as a whole, so a caller (in particular
// /health/ready) gets a definite answer instead of hanging.
const INITIAL_CONNECT_DEADLINE_MS = 2000;

async function getConnectedRedisClient(redisUrl: string): Promise<RedisClient> {
  if (state.redisClient) {
    return state.redisClient;
  }
  // Memoized so concurrent first-callers (e.g. two requests racing on a cold start) share one
  // connection attempt instead of each opening their own client.
  if (!state.redisConnectPromise) {
    state.redisConnectPromise = (async () => {
      const client: RedisClient = createClient({
        url: redisUrl,
        socket: {
          connectTimeout: INITIAL_CONNECT_DEADLINE_MS,
          reconnectStrategy: (retries) => Math.min(retries * 200, 3000),
        },
      });
      // node-redis requires an 'error' listener or an unhandled socket error can crash the
      // process. This must never itself throw - only record a narrow diagnostic event, never the
      // Redis URL/credentials (see docs/architecture/web-authentication.md).
      client.on("error", () => {
        recordSessionEvent("session_store_unavailable", { stage: "client" });
      });

      let timedOut = false;
      let timer: ReturnType<typeof setTimeout>;
      const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          timedOut = true;
          reject(new Error("Redis connection attempt timed out"));
        }, INITIAL_CONNECT_DEADLINE_MS);
      });

      // Not awaited directly in the race below: if `deadline` wins, this promise is still
      // pending and, once destroy() forces the socket closed, is likely to reject on its own -
      // with nothing left listening, that would be an unhandled rejection. The no-op catch here
      // exists solely to keep that late rejection from escaping; the real error is still
      // reported below via `deadline`'s own rejection.
      const connectAttempt = client.connect();
      connectAttempt.catch(() => {});

      try {
        await Promise.race([connectAttempt, deadline]);
      } catch (cause) {
        if (timedOut) {
          // Stop the client's own reconnect loop rather than leaving it retrying in the
          // background after this attempt has already been reported as failed.
          client.destroy();
        }
        throw cause;
      } finally {
        clearTimeout(timer!);
      }

      state.redisClient = client;
      return client;
    })();
  }
  try {
    return await state.redisConnectPromise;
  } catch (cause) {
    // A failed connection attempt must not be cached - the next caller should retry rather than
    // permanently inherit a rejected promise.
    state.redisConnectPromise = null;
    throw cause;
  }
}

/**
 * The single runtime composition point for web-session storage (issue #5): reads
 * getWebSessionStoreConfig() and returns the configured WebSessionStore. This is the only file
 * that imports @redis/client's createClient - every other caller (certification-runtime.ts, and
 * eventually the real session API routes) depends only on the narrow WebSessionStore interface.
 */
export async function getWebSessionStore(): Promise<WebSessionStore> {
  if (state.store) {
    return state.store;
  }

  const config = getWebSessionStoreConfig();
  if (config.mode === "memory") {
    state.store = new MemoryWebSessionStore();
    return state.store;
  }

  let client: RedisClient;
  try {
    client = await getConnectedRedisClient(config.redisUrl);
  } catch (cause) {
    throw new SessionStoreUnavailableError(
      "Could not connect to the configured Redis web-session store",
      { cause },
    );
  }

  // @redis/client's command methods are typed through a generic branded RESP-reply system
  // (see node_modules/@redis/client/dist/lib/RESP/types.d.ts) that RedisSessionClient
  // deliberately doesn't model - it targets the client's actual default-TypeMapping runtime
  // shape (plain string/number/null), which is what every command here actually returns.
  state.store = new RedisWebSessionStore(
    client as unknown as RedisSessionClient,
    {
      activeKeyId: config.activeKeyId,
      keys: config.keys,
    },
  );
  return state.store;
}

/**
 * Used only by GET /health/ready. Memory mode is always healthy (no external dependency); redis
 * mode pings the shared client. Never throws - callers get a plain boolean, never store/config
 * error detail (which must not leak into a health response body).
 */
export async function checkWebSessionStoreHealth(): Promise<boolean> {
  try {
    const store = await getWebSessionStore();
    if (store instanceof RedisWebSessionStore) {
      await store.ping();
    }
    return true;
  } catch {
    return false;
  }
}

/** Test-only: forces a fresh store/client for the next call. */
export function resetSessionStoreRuntimeForTests(): void {
  state.store = null;
  state.redisClient = null;
  state.redisConnectPromise = null;
}

import type { RedisSessionClient } from "../redis-web-session-store";

/**
 * A JS re-implementation of just enough Redis semantics (GET/SET NX+PXAT/EVAL of the exact CAS
 * script shape/DEL/PING) to unit-test RedisWebSessionStore's TypeScript wrapper - error
 * translation, timeout plumbing, corruption handling - without a real Redis. The actual Lua CAS
 * script's correctness against a real Redis/Lua engine is certified separately by
 * redis-web-session-store.integration.redis.test.ts.
 */
export class FakeRedisSessionClient implements RedisSessionClient {
  private readonly data = new Map<string, string>();

  getFault: () => boolean = () => false;
  setFault: () => boolean = () => false;
  evalFault: () => boolean = () => false;
  delFault: () => boolean = () => false;

  // Issue #10: simulates Redis latency. 0 (the default) means every command resolves
  // immediately, same as before this existed. A non-zero value races the command against the
  // AbortSignal RedisWebSessionStore.withTimeout() supplies (AbortSignal.timeout(commandTimeoutMs))
  // - exactly as the real @redis/client would when a command outlives that budget - so a "slow
  // Redis" scenario actually exercises the same abort/reject path a real timeout would, not a
  // hand-waved substitute. Applies to every command, including PING (RedisWebSessionStore's
  // readiness-probe path), not just the data commands.
  delayMs: () => number = () => 0;

  /**
   * Returns a fresh, independently-scoped view onto this same underlying data/fault hooks, bound
   * to `signal` - never mutates shared state on `this`. RedisWebSessionStore calls
   * `client.withAbortSignal(signal)` fresh immediately before every single command (see
   * `withTimeout()`), exactly like the real @redis/client; two operations in flight concurrently
   * therefore each get their own scoped view here too, so one's simulateLatency() call can never
   * observe the other's signal.
   */
  withAbortSignal(signal: AbortSignal): RedisSessionClient {
    return new SignalScopedFakeRedisSessionClient(this, signal);
  }

  async simulateLatency(signal: AbortSignal | undefined): Promise<void> {
    const ms = this.delayMs();
    if (ms <= 0) {
      return;
    }
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, ms);
      if (signal) {
        if (signal.aborted) {
          clearTimeout(timer);
          reject(signal.reason ?? new Error("aborted"));
          return;
        }
        signal.addEventListener(
          "abort",
          () => {
            clearTimeout(timer);
            reject(signal.reason ?? new Error("aborted"));
          },
          { once: true },
        );
      }
    });
  }

  async get(key: string, signal?: AbortSignal): Promise<string | null> {
    await this.simulateLatency(signal);
    if (this.getFault()) {
      throw new Error("fake redis: GET failed");
    }
    return this.data.get(key) ?? null;
  }

  async set(
    key: string,
    value: string,
    options: {
      condition: "NX";
      expiration: { type: "PXAT"; value: number };
    },
    signal?: AbortSignal,
  ): Promise<string | null> {
    await this.simulateLatency(signal);
    if (this.setFault()) {
      throw new Error("fake redis: SET failed");
    }
    if (options.condition === "NX" && this.data.has(key)) {
      return null;
    }
    this.data.set(key, value);
    return "OK";
  }

  async eval(
    _script: string,
    options: { keys: string[]; arguments: string[] },
    signal?: AbortSignal,
  ): Promise<unknown> {
    await this.simulateLatency(signal);
    if (this.evalFault()) {
      throw new Error("fake redis: EVAL failed");
    }
    const [key] = options.keys;
    const [expectedRevisionRaw, newValue] = options.arguments;

    const current = this.data.get(key);
    if (current === undefined) {
      return 0;
    }
    let decoded: unknown;
    try {
      decoded = JSON.parse(current);
    } catch {
      return 0;
    }
    if (
      typeof decoded !== "object" ||
      decoded === null ||
      typeof (decoded as Record<string, unknown>).revision !== "number"
    ) {
      return 0;
    }
    if (
      Number(expectedRevisionRaw) !== (decoded as { revision: number }).revision
    ) {
      return 0;
    }
    this.data.set(key, newValue);
    return 1;
  }

  async del(key: string, signal?: AbortSignal): Promise<number> {
    await this.simulateLatency(signal);
    if (this.delFault()) {
      throw new Error("fake redis: DEL failed");
    }
    return this.data.delete(key) ? 1 : 0;
  }

  async ping(signal?: AbortSignal): Promise<string> {
    await this.simulateLatency(signal);
    return "PONG";
  }

  /** Test-only inspection hook - never used by RedisWebSessionStore itself. */
  rawValue(key: string): string | undefined {
    return this.data.get(key);
  }
}

/** The per-call view `withAbortSignal` returns - see its doc comment above. */
class SignalScopedFakeRedisSessionClient implements RedisSessionClient {
  constructor(
    private readonly inner: FakeRedisSessionClient,
    private readonly signal: AbortSignal,
  ) {}

  withAbortSignal(signal: AbortSignal): RedisSessionClient {
    return new SignalScopedFakeRedisSessionClient(this.inner, signal);
  }

  get(key: string): Promise<string | null> {
    return this.inner.get(key, this.signal);
  }

  set(
    key: string,
    value: string,
    options: {
      condition: "NX";
      expiration: { type: "PXAT"; value: number };
    },
  ): Promise<string | null> {
    return this.inner.set(key, value, options, this.signal);
  }

  eval(
    script: string,
    options: { keys: string[]; arguments: string[] },
  ): Promise<unknown> {
    return this.inner.eval(script, options, this.signal);
  }

  del(key: string): Promise<number> {
    return this.inner.del(key, this.signal);
  }

  ping(): Promise<string> {
    return this.inner.ping(this.signal);
  }
}

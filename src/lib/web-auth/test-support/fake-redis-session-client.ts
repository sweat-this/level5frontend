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
  private signal: AbortSignal | undefined;

  getFault: () => boolean = () => false;
  setFault: () => boolean = () => false;
  evalFault: () => boolean = () => false;
  delFault: () => boolean = () => false;

  // Issue #10: simulates Redis latency. 0 (the default) means every command resolves
  // immediately, same as before this existed. A non-zero value races the command against the
  // AbortSignal RedisWebSessionStore.withTimeout() supplies (AbortSignal.timeout(commandTimeoutMs))
  // - exactly as the real @redis/client would when a command outlives that budget - so a "slow
  // Redis" scenario actually exercises the same abort/reject path a real timeout would, not a
  // hand-waved substitute.
  delayMs: () => number = () => 0;

  withAbortSignal(signal: AbortSignal): RedisSessionClient {
    this.signal = signal;
    return this;
  }

  private async simulateLatency(): Promise<void> {
    const ms = this.delayMs();
    if (ms <= 0) {
      return;
    }
    const signal = this.signal;
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

  async get(key: string): Promise<string | null> {
    await this.simulateLatency();
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
  ): Promise<string | null> {
    await this.simulateLatency();
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
  ): Promise<unknown> {
    await this.simulateLatency();
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

  async del(key: string): Promise<number> {
    await this.simulateLatency();
    if (this.delFault()) {
      throw new Error("fake redis: DEL failed");
    }
    return this.data.delete(key) ? 1 : 0;
  }

  async ping(): Promise<string> {
    return "PONG";
  }

  /** Test-only inspection hook - never used by RedisWebSessionStore itself. */
  rawValue(key: string): string | undefined {
    return this.data.get(key);
  }
}

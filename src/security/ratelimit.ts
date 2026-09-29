/**
 * Outgoing rate limiting and inbound buffer caps.
 *
 * A flow can feed a node far faster than Twitch accepts. The token bucket gives
 * outgoing chat a bounded send rate; the line buffer stops an inbound stream from
 * growing without limit. Both are deliberately small and dependency-free.
 */

/** A token bucket. `tryRemove()` is synchronous: callers await the returned delay. */
export class TokenBucket {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private readonly capacity: number,
    private readonly refillPerSecond: number,
    now = Date.now()
  ) {
    this.tokens = capacity;
    this.lastRefill = now;
  }

  private refill(now: number): void {
    const elapsed = Math.max(0, now - this.lastRefill);
    this.tokens = Math.min(this.capacity, this.tokens + (elapsed / 1000) * this.refillPerSecond);
    this.lastRefill = now;
  }

  /** True when a token was available without waiting. */
  tryRemove(now = Date.now()): boolean {
    this.refill(now);
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }

  /** Milliseconds until the next token, or 0 if one is available now. */
  delayMs(now = Date.now()): number {
    this.refill(now);
    if (this.tokens >= 1) return 0;
    return Math.ceil(((1 - this.tokens) / this.refillPerSecond) * 1000);
  }
}

/**
 * A fixed-size inbound buffer. Appending text past the cap drops the oldest data
 * rather than growing the buffer, so a hostile stream cannot exhaust memory.
 */
export class BoundedBuffer {
  private value = '';

  constructor(private readonly maxLength: number) {}

  append(chunk: string): string {
    if (!chunk) return this.value;
    this.value += chunk;
    if (this.value.length > this.maxLength) {
      this.value = this.value.slice(this.value.length - this.maxLength);
    }
    return this.value;
  }

  toString(): string {
    return this.value;
  }

  clear(): void {
    this.value = '';
  }

  get length(): number {
    return this.value.length;
  }
}

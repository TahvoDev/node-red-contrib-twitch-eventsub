/**
 * Inbound buffer cap.
 *
 * Outgoing rate limiting is not duplicated here: Twurple's ChatClient and
 * ApiClient already rate-limit per channel and per Helix bucket using Twitch's
 * own limits. This file keeps the one control Twurple does not expose: a
 * fixed-size buffer so a hostile inbound stream cannot grow memory.
 */

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

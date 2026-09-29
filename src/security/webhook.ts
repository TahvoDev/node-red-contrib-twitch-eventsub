/**
 * EventSub webhook verification and replay protection.
 *
 * This package currently receives EventSub over the WebSocket transport, so
 * nothing here is wired into a running node — it is provided for a future HTTP
 * webhook receiver and is unit-tested. The rules follow Twitch's documented
 * scheme: HMAC-SHA256 over `id + timestamp + rawBody`, compared in constant time,
 * with a bounded timestamp window and message-id dedupe.
 */

import { createHmac, timingSafeEqual } from 'crypto';

export const EVENTSUB_HEADERS = {
  id: 'twitch-eventsub-message-id',
  timestamp: 'twitch-eventsub-message-timestamp',
  signature: 'twitch-eventsub-message-signature',
  type: 'twitch-eventsub-message-type',
} as const;

/** Twitch signs with this prefix; the algorithm is fixed, so do not accept others. */
const SIGNATURE_PREFIX = 'sha256=';

/** Reject a signed message older than this (or more than this in the future). */
export const MAX_WEBHOOK_AGE_MS = 10 * 60 * 1000;

export type HeaderBag = Record<string, string | string[] | undefined>;

function headerValue(headers: HeaderBag, name: string): string {
  const value = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

/** HMAC-SHA256 of `id + timestamp + rawBody`, as Twitch computes it. */
export function computeEventsubSignature(messageId: string, timestamp: string, rawBody: Buffer | string, secret: string): string {
  const body = typeof rawBody === 'string' ? Buffer.from(rawBody, 'utf8') : rawBody;
  const mac = createHmac('sha256', secret)
    .update(messageId, 'utf8')
    .update(timestamp, 'utf8')
    .update(body)
    .digest('hex');
  return `${SIGNATURE_PREFIX}${mac}`;
}

/** Length-safe, constant-time comparison of an expected `sha256=...` signature. */
export function signaturesMatch(expected: string, provided: string): boolean {
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(provided, 'utf8');
  if (a.length !== b.length || a.length === 0) return false;
  return timingSafeEqual(a, b);
}

export interface WebhookVerifyOptions {
  secret: string;
  /** The raw request body, captured before JSON parsing. */
  rawBody: Buffer | string;
  headers: HeaderBag;
  /** Injectable clock for tests. */
  now?: number;
  maxAgeMs?: number;
}

export type WebhookVerifyResult =
  | { ok: true; messageId: string; timestamp: string }
  | { ok: false; reason: 'missing-headers' | 'stale-timestamp' | 'bad-signature' };

/**
 * Verifies the signature, then the timestamp window. Returns a result instead of
 * throwing so an HTTP handler can answer 403 without leaking which check failed.
 */
export function verifyEventsubRequest(options: WebhookVerifyOptions): WebhookVerifyResult {
  const messageId = headerValue(options.headers, EVENTSUB_HEADERS.id);
  const timestamp = headerValue(options.headers, EVENTSUB_HEADERS.timestamp);
  const provided = headerValue(options.headers, EVENTSUB_HEADERS.signature);
  if (!messageId || !timestamp || !provided) {
    return { ok: false, reason: 'missing-headers' };
  }

  const expected = computeEventsubSignature(messageId, timestamp, options.rawBody, options.secret);
  if (!signaturesMatch(expected, provided)) {
    return { ok: false, reason: 'bad-signature' };
  }

  const now = options.now ?? Date.now();
  const maxAge = options.maxAgeMs ?? MAX_WEBHOOK_AGE_MS;
  const sentAt = Date.parse(timestamp);
  if (!Number.isFinite(sentAt) || Math.abs(now - sentAt) > maxAge) {
    return { ok: false, reason: 'stale-timestamp' };
  }

  return { ok: true, messageId, timestamp };
}

/**
 * A bounded set of recently seen message ids. Old ids expire and the set is
 * capped so a flood cannot grow it without bound.
 */
export class ReplayGuard {
  private readonly seen = new Map<string, number>();
  private readonly ttlMs: number;
  private readonly maxEntries: number;

  constructor(ttlMs = MAX_WEBHOOK_AGE_MS, maxEntries = 5000) {
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
  }

  /** Records `messageId`; returns false when it was already seen (a replay). */
  check(messageId: string, now = Date.now()): boolean {
    this.prune(now);
    if (this.seen.has(messageId)) return false;
    if (this.seen.size >= this.maxEntries) {
      const oldest = this.seen.keys().next().value;
      if (oldest !== undefined) this.seen.delete(oldest);
    }
    this.seen.set(messageId, now + this.ttlMs);
    return true;
  }

  private prune(now: number): void {
    for (const [id, expires] of this.seen) {
      if (expires <= now) this.seen.delete(id);
    }
  }
}

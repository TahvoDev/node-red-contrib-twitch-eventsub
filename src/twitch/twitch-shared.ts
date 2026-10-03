import type { HelixChatAnnouncementColor } from '@twurple/api';

/** Shared by the Helix and chat nodes. */

/** Twitch caps a timeout at two weeks, in seconds. */
export const MAX_TIMEOUT_SECONDS = 1_209_600;

/**
 * Names whose value is a secret. `code` and the bare `token` are here so an
 * OAuth device code or an unqualified token is caught too; a benign match is
 * just redacted, which is harmless for a status badge or a log line.
 */
const SECRET_KEYS = 'client_secret|refresh_token|access_token|device_code|password|authorization|code|token';

/**
 * Strip secret values out of free text. Twurple's `HttpStatusCodeError` embeds
 * the failing request's URL and form body in `error.message`, so a query string
 * (`?client_secret=…`), a form body (`client_secret=…&refresh_token=…`), a JSON
 * body (`"client_secret":"…"`) or an `Authorization: Bearer …` header can all
 * appear. This is a display/log guard, not a security boundary — a producer that
 * formats the value another way can still slip past it.
 */
export function redactSecrets(text: unknown): string {
  return String(text ?? '')
    .replace(/(authorization\s*[:=]\s*bearer\s+)\S+/gi, '$1[redacted]')
    .replace(new RegExp(`\\b(${SECRET_KEYS})(?:=|%3D)[^&\\s"']+`, 'gi'), '$1=[redacted]')
    .replace(new RegExp(`(${SECRET_KEYS})(["']?\\s*:\\s*["'])[^"']*`, 'gi'), '$1$2[redacted]');
}

/**
 * The message to show or log for a caught error, with secret values removed.
 *
 * Twurple's `HttpStatusCodeError` puts the failing request's URL and form body
 * in `message`, and a failed token refresh puts `client_secret` and
 * `refresh_token` in that body. Those errors also expose `statusCode`/`url`, so
 * they are recognised and reduced to the first line
 * (`Encountered HTTP status code 400: Bad Request`), dropping URL/Method/Body
 * outright. Anything else falls back to the regex scrub.
 */
export function safeErrorMessage(error: unknown): string {
  const err = error as { message?: unknown; statusCode?: unknown; url?: unknown } | null | undefined;
  if (err && typeof err.statusCode === 'number' && typeof err.url === 'string') {
    return redactSecrets(String(err.message ?? '').split('\n')[0]);
  }
  if (typeof error === 'string') return redactSecrets(error);
  if (err && err.message !== undefined) return redactSecrets(String(err.message));
  return redactSecrets(String(error ?? ''));
}

/**
 * {@link redactSecrets} plus a 200-code-point cap, so one error cannot blow out
 * the node badge. The cap counts code points (not UTF-16 units), so it never
 * splits an emoji surrogate pair.
 */
export function redactStatusText(text: unknown): string {
  const redacted = redactSecrets(text);
  const chars = Array.from(redacted);
  return chars.length > 200 ? `${chars.slice(0, 200).join('')}…` : redacted;
}

/**
 * A redacted copy of an error for `node.error`/`node.warn`, so a failed auth
 * request does not put the client secret and refresh token in the log or the
 * debug sidebar. Returns the original error untouched when there was nothing to
 * redact.
 */
export function redactError(error: unknown): Error | string {
  if (!(error instanceof Error)) return safeErrorMessage(error);
  const message = safeErrorMessage(error);
  if (message === error.message) return error;
  const copy = new Error(message);
  if (error.stack) copy.stack = error.stack.replace(error.message, message);
  return copy;
}

const ANNOUNCEMENT_COLORS: readonly HelixChatAnnouncementColor[] = [
  'primary',
  'blue',
  'green',
  'orange',
  'purple',
];

/**
 * Twitch only accepts its five announcement colours, so anything else —
 * including the sender's hex chat colour that twitch-chat-in puts in msg.color —
 * falls back to primary rather than failing the announcement. An explicit
 * `msg.announceColor` wins; the optional second argument is a node config (or
 * colour string) to fall back to.
 */
export function resolveAnnounceColor(msg: any, fallback?: any): HelixChatAnnouncementColor {
  const preferred = fallback && typeof fallback === 'object' ? fallback.color : fallback;
  const requested = String(msg?.announceColor ?? preferred ?? msg?.color ?? '').toLowerCase();
  return (ANNOUNCEMENT_COLORS as readonly string[]).includes(requested)
    ? (requested as HelixChatAnnouncementColor)
    : 'primary';
}

/**
 * Hard cap on any single inbound string. Twitch chat/whisper text can reach
 * 10000 code points, so nothing legitimate is cut. The cap counts code points
 * (not UTF-16 units) so it can never split a surrogate pair.
 */
export const MAX_INBOUND_STRING_LENGTH = 10_000;

/** How deep {@link sanitizeInbound} walks into nested structures. */
export const MAX_INBOUND_DEPTH = 20;

/** Fallback for engines without String.prototype.toWellFormed (Node < 20). */
const LONE_SURROGATE_RE =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

/**
 * Line breaks become spaces and invisible/format characters are dropped, so a
 * viewer cannot smuggle a newline (log/IRC/shell injection) or a zero-width or
 * bidi character (display spoofing) through a Twitch-sourced string. ZWNJ and
 * ZWJ are kept: they are legitimate in emoji and some scripts. This runs before
 * NFKC, which is what lets a stripped zero-width character stop blocking
 * composition (`a` + ZWSP + U+0301 folds to `á`).
 */
function stripTwitchText(value: string): string {
  return value
    .replace(/[\t\n\v\f\r\u0085\u2028\u2029]+/g, ' ')
    .replace(
      /[\u0000-\u0008\u000E-\u001F\u007F-\u009F\u00AD\u200B\u200E\u200F\u061C\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g,
      ''
    );
}

/**
 * Normalises one string from a Twitch payload. This is *normalization, not
 * escaping*: shell, HTML and template syntax survive unchanged so downstream
 * code still has to escape for its own sink. Order is fixed for idempotence:
 * make well formed → strip+fold → NFKC → cap.
 */
export function sanitizeInboundString(value: unknown): string {
  const raw = value === null || value === undefined ? '' : String(value);
  const wellFormed =
    typeof (raw as any).toWellFormed === 'function'
      ? (raw as any).toWellFormed()
      : raw.replace(LONE_SURROGATE_RE, '\uFFFD');
  const folded = stripTwitchText(wellFormed).normalize('NFKC');
  // Cheap path: a string within the cap in UTF-16 units is within it in code
  // points, so nothing to count. Otherwise every code point is at most two
  // units, so the first 2*cap units hold at least `cap` code points; walking
  // that window (instead of the whole string) and joining the first `cap`
  // still counts code points, so a pair is never split.
  if (folded.length <= MAX_INBOUND_STRING_LENGTH) return folded;
  const window = folded.slice(0, MAX_INBOUND_STRING_LENGTH * 2);
  return Array.from(window).slice(0, MAX_INBOUND_STRING_LENGTH).join('');
}

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function isPlainObject(value: object): boolean {
  const proto = Object.getPrototypeOf(value);
  return proto === null || proto === Object.prototype;
}

/**
 * Recursively normalises a value that came from Twitch before it reaches a
 * Node-RED message. Plain objects and arrays are rebuilt with every string
 * passed through {@link sanitizeInboundString}; `__proto__`, `constructor` and
 * `prototype` keys are dropped so a raw payload cannot pollute a prototype.
 * Dates, Buffers and typed arrays pass through untouched; class instances are
 * left alone (the EventSub mapper flattens the ones that carry text). The walk
 * is depth- and cycle-bounded so a hostile/self-referential payload cannot hang
 * the flow.
 */
export function sanitizeInbound(
  value: unknown,
  depth = 0,
  seen: WeakSet<object> = new WeakSet()
): unknown {
  if (typeof value === 'string') return sanitizeInboundString(value);
  if (value === null || value === undefined) return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'object') return value;

  if (value instanceof Date || ArrayBuffer.isView(value)) return value;
  if (seen.has(value)) return undefined;
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      return depth >= MAX_INBOUND_DEPTH
        ? []
        : value.map((item) => sanitizeInbound(item, depth + 1, seen));
    }
    if (isPlainObject(value)) {
      if (depth >= MAX_INBOUND_DEPTH) return {};
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(value)) {
        if (FORBIDDEN_KEYS.has(key)) continue;
        out[key] = sanitizeInbound((value as Record<string, unknown>)[key], depth + 1, seen);
      }
      return out;
    }
    return value;
  } finally {
    seen.delete(value);
  }
}

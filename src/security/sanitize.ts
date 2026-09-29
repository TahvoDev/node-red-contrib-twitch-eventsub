/**
 * The place strings *from Twitch* are cleaned.
 *
 * The untrusted data is what Twitch sends: chat text, EventSub fields, Helix
 * response strings. Those cross `sanitize(value, policy)` (or a named helper)
 * before a consumer renders, logs or forwards them. The builder's own input —
 * node config and `msg.*` — is not rewritten here; Twurple validates and
 * neutralises what actually goes back out on the wire.
 */

import type { SafeHtml, SafeLogLine, SanitizePolicy } from './types';

/** Twitch rejects chat/announcement text past 500 characters. */
export const MAX_CHAT_MESSAGE_LENGTH = 500;
/** Generic text fields (names, titles) are capped well below any sane value. */
export const MAX_TEXT_LENGTH = 1000;
/** Longest input any regex here is allowed to see. Caps ReDoS on hostile input. */
export const MAX_SCAN_LENGTH = 10000;

/** C0/C1 control characters, excluding the whitespace we translate separately. */
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;
/** Bidi overrides/isolates and the directional marks: can reorder or spoof a line. */
const BIDI_CHARS = /[\u202A-\u202E\u2066-\u2069\u200E\u200F\u061C]/g;
/** Zero-width and invisible joiners/formatters. */
const ZERO_WIDTH_CHARS = /[\u200B-\u200D\u2060\uFEFF]/g;
/** Whitespace controls that stay meaningful as a single space. */
const WHITESPACE_CONTROLS = /[\r\n\t\0\u000B\u000C]+/g;

/** Twitch logins are 1-25 chars of a-z, 0-9 and underscore (they are lowercase). */
const TWITCH_LOGIN_RE = /^[a-z0-9_]{1,25}$/;
/** Twitch user ids are numeric strings. */
const TWITCH_USER_ID_RE = /^\d{1,20}$/;

export class SecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecurityError';
  }
}

/** Cuts a string to `max` code points without splitting a surrogate pair. */
function capCodePoints(value: string, max: number): string {
  if (max <= 0) return '';
  // Fast path: UTF-16 length is an upper bound on the code-point count, so a
  // string already within `max` needs no allocation (avoids a 10M-element array
  // for a 10 MB input that is about to be capped).
  if (value.length <= max) return value;
  const points = Array.from(value);
  return points.length > max ? points.slice(0, max).join('') : value;
}

/**
 * NFKC-normalises and removes control, bidi and zero-width characters. CR, LF,
 * tab and NUL become a single space so words do not run together. Always scans at
 * most {@link MAX_SCAN_LENGTH} characters.
 */
function scrub(value: unknown): string {
  if (value === null || value === undefined) return '';
  const source = typeof value === 'string' ? value : String(value);
  const capped = capCodePoints(source, MAX_SCAN_LENGTH);
  return capped
    .normalize('NFKC')
    .replace(WHITESPACE_CONTROLS, ' ')
    .replace(CONTROL_CHARS, '')
    .replace(BIDI_CHARS, '')
    .replace(ZERO_WIDTH_CHARS, '');
}

/**
 * Generic text: normalised, controls removed, no newlines, capped. Never returns
 * a string containing CR/LF/NUL/bidi or longer than `max` code points.
 */
export function sanitizeText(raw: unknown, max: number = MAX_TEXT_LENGTH): string {
  return capCodePoints(scrub(raw), max);
}

export function isLogin(raw: unknown): boolean {
  return TWITCH_LOGIN_RE.test(String(raw ?? '').trim().replace(/^#/, '').toLowerCase());
}

export function isUserId(raw: unknown): boolean {
  return TWITCH_USER_ID_RE.test(String(raw ?? '').trim());
}

/** Escapes `& < > " '` for safe interpolation into HTML text or attributes. */
export function escapeHtml(raw: unknown): SafeHtml {
  const text = raw === null || raw === undefined ? '' : String(raw);
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;') as SafeHtml;
}

/** Redacts anything that looks like a Twitch/HTTP secret before it is logged. */
export function redactSecrets(raw: unknown): string {
  const text = capCodePoints(String(raw ?? ''), MAX_SCAN_LENGTH);
  return text
    .replace(/oauth:[A-Za-z0-9]+/gi, 'oauth:[redacted]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, 'Bearer [redacted]')
    .replace(
      /\b(access_token|refresh_token|client_secret|client_id|device_code|token|authorization|code)\b("?\s*[:=]\s*"?)[A-Za-z0-9._~+/=-]{6,}/gi,
      '$1$2[redacted]'
    );
}

/**
 * A single log/error line: secrets redacted, controls removed, newlines folded
 * and the result capped. Use for anything that started as external input.
 */
export function sanitizeLogLine(raw: unknown, max = 500): SafeLogLine {
  return sanitizeText(redactSecrets(raw), max) as SafeLogLine;
}

/** A node status line: one short line, truncated, never a raw external string. */
export function sanitizeStatus(raw: unknown, max = 40): SafeLogLine {
  const line = sanitizeText(redactSecrets(raw), max).trim();
  return (line.length > max ? `${line.slice(0, max - 1)}…` : line) as SafeLogLine;
}

/* ---------------------------------------------------------------- dispatcher */

export interface SanitizeOptions {
  max?: number;
}

export function sanitize(raw: unknown, policy: 'html', options?: SanitizeOptions): SafeHtml;
export function sanitize(raw: unknown, policy: 'log' | 'status', options?: SanitizeOptions): SafeLogLine;
export function sanitize(raw: unknown, policy: 'text' | 'topic', options?: SanitizeOptions): string;
export function sanitize(
  raw: unknown,
  policy: SanitizePolicy,
  options: SanitizeOptions = {}
): string {
  switch (policy) {
    case 'html':
      return escapeHtml(raw);
    case 'log':
      return sanitizeLogLine(raw, options.max);
    case 'status':
      return sanitizeStatus(raw, options.max);
    case 'text':
      return sanitizeText(raw, options.max);
    case 'topic':
      return sanitizeText(raw, options.max ?? 200);
    default: {
      const exhaustive: never = policy;
      throw new SecurityError(`Unknown sanitize policy: ${String(exhaustive)}`);
    }
  }
}

export { TWITCH_LOGIN_RE, TWITCH_USER_ID_RE, capCodePoints, scrub };

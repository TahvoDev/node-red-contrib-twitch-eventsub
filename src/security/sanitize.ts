/**
 * The one place untrusted strings are cleaned.
 *
 * Every node pushes external data through `sanitize(value, policy)` (or one of
 * the named helpers below, all of which `sanitize` delegates to) before it can
 * reach an IRC line, a URL, a node status/log or the editor DOM. That keeps the
 * character rules — NFKC, control/bidi/zero-width removal, length caps — in a
 * single auditable function instead of copied into each node.
 */

import type {
  SafeChatText,
  SafeHtml,
  SafeIrcLine,
  SafeLogLine,
  SanitizePolicy,
  TwitchLogin,
  TwitchUserId,
} from './types';

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

/** Chat text: the generic rule with Twitch's 500-character cap. */
export function sanitizeChatText(raw: unknown, max: number = MAX_CHAT_MESSAGE_LENGTH): SafeChatText {
  return sanitizeText(raw, Math.min(max, MAX_CHAT_MESSAGE_LENGTH)) as SafeChatText;
}

export interface IrcLineOptions {
  /** Command names (without the prefix) the node is explicitly allowed to issue. */
  allowCommands?: readonly string[];
  max?: number;
}

/**
 * Produces one IRC line. Strips CR/LF/NUL, caps the length, and neutralises a
 * leading `/` or `.` (Twitch treats those as commands) unless the command is on
 * the node's explicit allowlist. Never build an IRC command by concatenation.
 */
export function toIrcLine(raw: unknown, options: IrcLineOptions = {}): SafeIrcLine {
  const max = Math.min(options.max ?? MAX_CHAT_MESSAGE_LENGTH, MAX_CHAT_MESSAGE_LENGTH);
  let line = sanitizeText(raw, max);
  line = line.replace(/\0/g, ' ');

  const commandMatch = line.match(/^([/.][A-Za-z]+)\b/);
  if (commandMatch) {
    const allowed = (options.allowCommands ?? []).some(
      (command) => command.toLowerCase() === commandMatch[1].toLowerCase()
    );
    if (!allowed) line = ` ${line}`;
  }

  return line as SafeIrcLine;
}

/** A valid Twitch login, lower-cased and validated. Throws {@link SecurityError} otherwise. */
export function assertLogin(raw: unknown): TwitchLogin {
  const login = String(raw ?? '')
    .trim()
    .replace(/^#/, '')
    .toLowerCase();
  if (!TWITCH_LOGIN_RE.test(login)) {
    throw new SecurityError('Not a valid Twitch login (1-25 letters, digits or underscores)');
  }
  return login as TwitchLogin;
}

/** A valid numeric Twitch user id. Throws {@link SecurityError} otherwise. */
export function assertUserId(raw: unknown): TwitchUserId {
  const id = String(raw ?? '').trim();
  if (!TWITCH_USER_ID_RE.test(id)) {
    throw new SecurityError('Not a valid Twitch user id (1-20 digits)');
  }
  return id as TwitchUserId;
}

export function isLogin(raw: unknown): boolean {
  return TWITCH_LOGIN_RE.test(String(raw ?? '').trim().replace(/^#/, '').toLowerCase());
}

export function isUserId(raw: unknown): boolean {
  return TWITCH_USER_ID_RE.test(String(raw ?? '').trim());
}

/**
 * Channel names are logins. Strips a leading `#`, lower-cases, and returns `''`
 * for anything that is not a valid login so a caller fails loudly rather than
 * joining an attacker-chosen channel.
 */
export function normalizeChannel(raw: unknown): string {
  const candidate = scrub(raw).trim().replace(/^#/, '').toLowerCase();
  return TWITCH_LOGIN_RE.test(candidate) ? candidate : '';
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
export function sanitizeStatus(raw: unknown, max = 40): string {
  const line = sanitizeText(redactSecrets(raw), max).trim();
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

/* ---------------------------------------------------------------- dispatcher */

export interface SanitizeOptions extends IrcLineOptions {
  max?: number;
}

export function sanitize(raw: unknown, policy: 'chat', options?: SanitizeOptions): SafeChatText;
export function sanitize(raw: unknown, policy: 'irc', options?: IrcLineOptions): SafeIrcLine;
export function sanitize(raw: unknown, policy: 'login', options?: SanitizeOptions): TwitchLogin;
export function sanitize(raw: unknown, policy: 'userId', options?: SanitizeOptions): TwitchUserId;
export function sanitize(raw: unknown, policy: 'channel', options?: SanitizeOptions): string;
export function sanitize(raw: unknown, policy: 'html', options?: SanitizeOptions): SafeHtml;
export function sanitize(raw: unknown, policy: 'log', options?: SanitizeOptions): SafeLogLine;
export function sanitize(raw: unknown, policy: 'status', options?: SanitizeOptions): string;
export function sanitize(raw: unknown, policy: 'text' | 'topic', options?: SanitizeOptions): string;
export function sanitize(
  raw: unknown,
  policy: SanitizePolicy,
  options: SanitizeOptions = {}
): string {
  switch (policy) {
    case 'chat':
      return sanitizeChatText(raw, options.max);
    case 'irc':
      return toIrcLine(raw, options);
    case 'login':
      return assertLogin(raw);
    case 'userId':
      return assertUserId(raw);
    case 'channel':
      return normalizeChannel(raw);
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

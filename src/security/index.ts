/**
 * Public surface of the security module. Nodes import from here only.
 *
 * Scope: strings *from Twitch*. `sanitize(value, policy)` is the entry point for
 * cleaning them; the named helpers are what the Twitch-facing call sites use. The
 * builder's own input is not sanitized — Twurple validates and neutralises what
 * goes back out to Twitch.
 */

export type { Untrusted, SafeLogLine, SafeHtml, SanitizePolicy } from './types';

export {
  SecurityError,
  sanitize,
  sanitizeText,
  sanitizeLogLine,
  sanitizeStatus,
  isLogin,
  isUserId,
  escapeHtml,
  redactSecrets,
  MAX_CHAT_MESSAGE_LENGTH,
  MAX_TEXT_LENGTH,
  MAX_SCAN_LENGTH,
} from './sanitize';

export {
  validateSchema,
  safeGet,
  safeMerge,
  sanitizeDeep,
  buildUrl,
  markUntrusted,
  ALLOWED_URL_HOSTS,
  type FieldSpec,
  type Schema,
  type TwitchEnvelope,
  type UrlPolicy,
} from './boundary';

export {
  EVENTSUB_HEADERS,
  MAX_WEBHOOK_AGE_MS,
  computeEventsubSignature,
  signaturesMatch,
  verifyEventsubRequest,
  ReplayGuard,
  type HeaderBag,
  type WebhookVerifyOptions,
  type WebhookVerifyResult,
} from './webhook';

export { BoundedBuffer } from './buffer';

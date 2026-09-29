/**
 * Public surface of the security module. Nodes import from here only.
 *
 * `sanitize(value, policy)` is the single entry point every node uses to clean an
 * external string; the named helpers exist for call sites that need a specific
 * branded type and are what `sanitize` delegates to.
 */

export type {
  Untrusted,
  SafeChatText,
  SafeIrcLine,
  TwitchLogin,
  TwitchUserId,
  SafeLogLine,
  SafeHtml,
  SanitizePolicy,
} from './types';

export {
  SecurityError,
  sanitize,
  sanitizeText,
  sanitizeChatText,
  sanitizeLogLine,
  sanitizeStatus,
  toIrcLine,
  assertLogin,
  assertUserId,
  isLogin,
  isUserId,
  normalizeChannel,
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

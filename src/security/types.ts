/**
 * Branded string types for data that has crossed a trust boundary.
 *
 * A plain `string` could be anything; these brands only exist on values produced
 * by the sanitizer/validator functions in this module. They are a compile-time
 * contract, not a runtime check — a cast can defeat them — but they stop a raw
 * external string being passed to an IRC line, URL, DOM or log by mistake.
 */

/** A value that came from outside the node and has not been validated. */
export type Untrusted<T = unknown> = T & { readonly __untrusted: true };

/** Chat text that has passed through {@link sanitize}: control/bidi/zero-width removed, capped. */
export type SafeChatText = string & { readonly __safeChatText: unique symbol };

/** A single IRC line ready for the socket: no CR/LF/NUL, no command prefix unless allowlisted. */
export type SafeIrcLine = string & { readonly __safeIrcLine: unique symbol };

/** A Twitch login: `^[A-Za-z0-9_]{1,25}$`, lower-cased. */
export type TwitchLogin = string & { readonly __twitchLogin: unique symbol };

/** A numeric Twitch user id: `^\d{1,20}$`. */
export type TwitchUserId = string & { readonly __twitchUserId: unique symbol };

/** One line of human-readable text safe to put in a node status or log. */
export type SafeLogLine = string & { readonly __safeLogLine: unique symbol };

/** HTML-escaped text safe to interpolate into markup. */
export type SafeHtml = string & { readonly __safeHtml: unique symbol };

/** The policies {@link sanitize} understands. */
export type SanitizePolicy =
  | 'text'
  | 'chat'
  | 'irc'
  | 'login'
  | 'userId'
  | 'channel'
  | 'status'
  | 'log'
  | 'html'
  | 'topic';

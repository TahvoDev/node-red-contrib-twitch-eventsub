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

/** One line of human-readable text safe to put in a node status or log. */
export type SafeLogLine = string & { readonly __safeLogLine: unique symbol };

/** HTML-escaped text safe to interpolate into markup. */
export type SafeHtml = string & { readonly __safeHtml: unique symbol };

/**
 * The policies {@link sanitize} understands. These clean data *from* Twitch
 * before it reaches a consumer; flow input (node config, `msg.*`) is the
 * builder's own and is not rewritten.
 */
export type SanitizePolicy = 'text' | 'status' | 'log' | 'html' | 'topic';

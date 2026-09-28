import type { HelixChatAnnouncementColor } from '@twurple/api';

/** Shared by the Helix and chat nodes. */

/** Twitch caps a timeout at two weeks, in seconds. */
export const MAX_TIMEOUT_SECONDS = 1_209_600;

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

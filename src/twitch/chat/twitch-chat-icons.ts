/**
 * The glyph each Twitch Chat node uses. `scripts/generate-chat-icons.js` renders
 * the glyph white on Node-RED's standard icon canvas, producing one
 * `<type>.svg` per node under `dist/twitch/icons/`.
 *
 * Glyph names refer to Bootstrap Icons (MIT); their paths are vendored in
 * `src/icons/glyphs.json` so the build does not need the package installed.
 */
export const CHAT_ICONS: Record<string, string> = {
  'twitch-chat-connection': 'broadcast',
  'twitch-chat-in': 'chat-fill',
  'twitch-chat-send': 'send-fill',
  'twitch-chat-reply': 'reply-fill',
  'twitch-chat-ban': 'slash-circle-fill',
  'twitch-chat-timeout': 'stopwatch-fill',
  'twitch-chat-unban': 'unlock-fill',
  'twitch-chat-delete-message': 'trash-fill',
  'twitch-chat-announce': 'megaphone-fill',
  'twitch-chat-clear': 'eraser-fill',
  'twitch-chat-command': 'terminal-fill',
  'twitch-chat-join': 'box-arrow-in-right',
  'twitch-chat-part': 'box-arrow-right',
};

/** The generated icon filename each node references from its editor HTML. */
export function chatIconFor(type: string): string {
  return `${type}.svg`;
}

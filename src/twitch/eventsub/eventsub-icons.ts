/**
 * The glyph each EventSub node uses. `scripts/generate-eventsub-icons.js` draws
 * the glyph white and adds a small Twitch mark in the corner, producing one
 * `twitch-eventsub-<name>.svg` per node under `dist/twitch/icons/`.
 *
 * Glyph names refer to Bootstrap Icons (MIT); their paths are vendored in
 * `src/icons/glyphs.json` so the build does not need the package installed.
 */
export const EVENT_ICONS: Record<string, string> = {
  'automod-message-hold': 'shield-exclamation',
  'automod-message-hold-v2': 'shield-fill-exclamation',
  'automod-message-update': 'shield-check',
  'automod-message-update-v2': 'shield-fill-check',
  'automod-settings-update': 'sliders',
  'automod-terms-update': 'card-checklist',

  'channel-ad-break-begin': 'badge-ad-fill',
  'channel-automatic-reward-redemption-add': 'box2-heart-fill',
  'channel-automatic-reward-redemption-add-v2': 'box2-heart-fill',
  'channel-ban': 'slash-circle-fill',
  'channel-bits-use': 'gem',
  'channel-charity-campaign-progress': 'heart-half',
  'channel-charity-campaign-start': 'heart-fill',
  'channel-charity-campaign-stop': 'heartbreak-fill',
  'channel-charity-donation': 'heart-arrow',
  'channel-chat-clear': 'eraser-fill',
  'channel-chat-clear-user-messages': 'person-x',
  'channel-chat-message': 'chat-fill',
  'channel-chat-message-delete': 'trash-fill',
  'channel-chat-notification': 'bell-fill',
  'channel-chat-settings-update': 'gear-fill',
  'channel-chat-user-message-hold': 'pause-circle-fill',
  'channel-chat-user-message-update': 'pencil-square',
  'channel-cheer': 'cash-coin',
  'channel-follow': 'person-plus-fill',
  'channel-goal-begin': 'flag-fill',
  'channel-goal-end': 'trophy-fill',
  'channel-goal-progress': 'bullseye',
  'channel-hype-train-begin': 'fire',
  'channel-hype-train-begin-v2': 'fire',
  'channel-hype-train-end': 'trophy-fill',
  'channel-hype-train-end-v2': 'trophy-fill',
  'channel-hype-train-progress': 'graph-up-arrow',
  'channel-hype-train-progress-v2': 'graph-up-arrow',
  'channel-moderation': 'hammer',
  'channel-moderator-add': 'person-check-fill',
  'channel-moderator-remove': 'person-dash-fill',
  'channel-poll-begin': 'bar-chart-fill',
  'channel-poll-end': 'bar-chart-line-fill',
  'channel-poll-progress': 'bar-chart-steps',
  'channel-prediction-begin': 'dice-5-fill',
  'channel-prediction-end': 'dice-6-fill',
  'channel-prediction-lock': 'lock-fill',
  'channel-prediction-progress': 'stars',
  'channel-raid-from': 'box-arrow-up-right',
  'channel-raid-to': 'box-arrow-in-right',
  'channel-redemption-add': 'bag-heart-fill',
  'channel-redemption-update': 'arrow-repeat',
  'channel-reward-add': 'plus-circle-fill',
  'channel-reward-remove': 'dash-circle-fill',
  'channel-reward-update': 'pencil-fill',
  'channel-shared-chat-session-begin': 'people-fill',
  'channel-shared-chat-session-end': 'people-fill',
  'channel-shared-chat-session-update': 'people-fill',
  'channel-shield-mode-begin': 'shield-fill',
  'channel-shield-mode-end': 'shield-slash-fill',
  'channel-shoutout-create': 'megaphone-fill',
  'channel-shoutout-receive': 'chat-quote-fill',
  'channel-stream-offline': 'wifi-off',
  'channel-stream-online': 'broadcast',
  'channel-subscription': 'star-fill',
  'channel-subscription-end': 'star-half',
  'channel-subscription-gift': 'gift-fill',
  'channel-subscription-message': 'chat-heart-fill',
  'channel-suspicious-user-message': 'exclamation-triangle-fill',
  'channel-suspicious-user-update': 'exclamation-diamond-fill',
  'channel-unban': 'unlock-fill',
  'channel-unban-request-create': 'envelope-fill',
  'channel-unban-request-resolve': 'envelope-check-fill',
  'channel-update': 'pencil-fill',
  'channel-vip-add': 'diamond-fill',
  'channel-vip-remove': 'diamond-half',
  'channel-warning-acknowledge': 'check2-circle',
  'channel-warning-send': 'exclamation-octagon-fill',

  'user-authorization-grant': 'key-fill',
  'user-authorization-revoke': 'shield-x',
  'user-update': 'person-lines-fill',
  'user-whisper-message': 'chat-left-text-fill',
};

/** The generated icon filename each node references from its editor HTML. */
export function iconFor(type: string): string {
  return `${type}.svg`;
}

/** The Bootstrap Icons glyph name for a node type, with a safe fallback. */
export function glyphFor(type: string): string {
  return EVENT_ICONS[type.replace(/^twitch-eventsub-/, '')] ?? 'broadcast';
}

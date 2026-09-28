import type { HelixField } from '../define';

/**
 * The shared "Broadcaster" field: blank defaults to the authenticated user.
 * Most channel, chat, moderation and monetisation specs start with this.
 */
export const broadcaster: HelixField = {
  name: 'broadcaster',
  label: 'Broadcaster',
  kind: 'user',
  optional: true,
  aliases: ['broadcasterId'],
  hint: 'blank = authenticated user',
  faIcon: 'fa-user',
};

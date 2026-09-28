import type { HelixField, HelixSelectOption } from '../define';

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

/** The shared optional "User" field: blank defaults to the authenticated user. */
export const selfUser: HelixField = {
  name: 'user',
  label: 'User',
  kind: 'user',
  optional: true,
  aliases: ['userId'],
  hint: 'blank = authenticated user',
  faIcon: 'fa-user',
};

/** The common leave-unchanged / on / off option list. */
export function triState(
  blankLabel = 'leave unchanged',
  onLabel = 'on',
  offLabel = 'off'
): HelixSelectOption[] {
  return [
    { value: '', label: blankLabel },
    { value: 'true', label: onLabel },
    { value: 'false', label: offLabel },
  ];
}

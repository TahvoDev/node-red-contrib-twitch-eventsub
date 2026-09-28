import { defineHelix } from '../define';
import { mapUser } from '../twitch-helix-utils';

export const userSpecs = [
  defineHelix({
    type: 'twitch-helix-get-authenticated-user',
    label: 'get auth user',
    help: 'Fetches the profile of the currently authenticated Twitch user.',
    scopes: [],
    fields: [
      {
        name: 'withEmail',
        label: 'Include Email',
        kind: 'bool',
        default: false,
        primary: true,
        faIcon: 'fa-envelope',
        hint: 'requires the user:read:email scope',
      },
    ],
    run: async ({ api, moderatorId, input }) =>
      api.users.getAuthenticatedUser(moderatorId, input.withEmail === true),
    map: (user) => ({
      ...mapUser(user),
      email: user.email ?? null,
    }),
  }),

  defineHelix({
    type: 'twitch-helix-user-block',
    label: 'block user',
    help: 'Blocks or unblocks a Twitch user using the authenticated configuration context.',
    scopes: [],
    fields: [
      {
        name: 'action',
        label: 'Action',
        kind: 'select',
        default: 'block',
        options: [
          { value: 'block', label: 'Block' },
          { value: 'unblock', label: 'Unblock' },
        ],
      },
      {
        name: 'targetId',
        label: 'Target User',
        kind: 'user',
        required: true,
        hint: 'User ID or Username to block/unblock',
      },
      {
        name: 'reason',
        label: 'Reason',
        kind: 'select',
        default: '',
        options: [
          { value: '', label: '— none —' },
          { value: 'spam', label: 'Spam' },
          { value: 'harassment', label: 'Harassment' },
          { value: 'other', label: 'Other' },
        ],
        hint: 'block only',
      },
      {
        name: 'sourceContext',
        label: 'Source',
        kind: 'select',
        default: '',
        options: [
          { value: '', label: '— none —' },
          { value: 'chat', label: 'Chat' },
          { value: 'whisper', label: 'Whisper' },
        ],
        hint: 'block only',
      },
      {
        name: 'broadcaster',
        label: 'Broadcaster',
        kind: 'user',
        optional: true,
        hidden: true,
        aliases: ['broadcasterId'],
        hint: 'blank = authenticated user',
      },
    ],
    run: async ({ api, broadcasterId, input, raw }) => {
      if (input.action === 'unblock') {
        await api.users.deleteBlock(broadcasterId, input.targetId);
        return { action: 'unblock', broadcasterId, targetId: input.targetId, targetName: raw.targetId };
      }
      await api.users.createBlock(broadcasterId, input.targetId, {
        reason: input.reason,
        sourceContext: input.sourceContext,
      });
      return { action: 'block', broadcasterId, targetId: input.targetId, targetName: raw.targetId };
    },
  }),
];

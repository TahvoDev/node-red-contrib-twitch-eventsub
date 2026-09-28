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

  defineHelix({
    type: 'twitch-helix-get-users',
    label: 'get users',
    help: 'Looks up Twitch profiles using explicit fields for IDs and Usernames. If both inputs are used simultaneously, the node merges and de-duplicates the results automatically.',
    scopes: [],
    fields: [
      {
        name: 'userIds',
        label: 'User IDs',
        kind: 'idList',
        default: '',
        aliases: ['userId'],
        faIcon: 'fa-hashtag',
        hint: 'e.g. 44322889, 123456',
      },
      {
        name: 'logins',
        label: 'Usernames',
        kind: 'idList',
        default: '',
        aliases: ['login'],
        faIcon: 'fa-user',
        hint: 'e.g. shroud, ludwig',
      },
    ],
    run: async ({ api, input }) => {
      const ids = input.userIds;
      const logins = input.logins;

      if (!ids.length && !logins.length) {
        throw new Error('No user query provided. Please fill out either User IDs or Usernames.');
      }

      let usersFromIds: any[] = [];
      let usersFromLogins: any[] = [];

      if (ids.length) {
        const res =
          ids.length === 1
            ? await api.users.getUserById(ids[0])
            : await api.users.getUsersByIds(ids);
        if (res) usersFromIds = Array.isArray(res) ? res : [res];
      }

      if (logins.length) {
        const res =
          logins.length === 1
            ? await api.users.getUserByName(logins[0])
            : await api.users.getUsersByNames(logins);
        if (res) usersFromLogins = Array.isArray(res) ? res : [res];
      }

      const seenIds = new Set<string>();
      const plainUsers = [...usersFromIds, ...usersFromLogins]
        .map(mapUser)
        .filter((user) => {
          if (!user || seenIds.has(user.id)) return false;
          seenIds.add(user.id);
          return true;
        });

      if (plainUsers.length === 0) {
        throw new Error('No matching users could be found on Twitch.');
      }

      return plainUsers.length === 1 ? plainUsers[0] : plainUsers;
    },
  }),

  defineHelix({
    type: 'twitch-helix-get-blocks',
    label: 'get blocks',
    help: 'Gets a list of users blocked by the given Twitch user.',
    scopes: ['user:read:blocked_users'],
    fields: [
      {
        name: 'userId',
        label: 'User ID',
        kind: 'string',
        default: '',
        hidden: true,
      },
      {
        name: 'limit',
        label: 'Limit',
        kind: 'int',
        default: '',
        faIcon: 'fa-list',
        hint: 'Results per page (max 100)',
      },
    ],
    run: async ({ api, moderatorId, input, msg }) => {
      const limit = input.limit ?? 20;
      const after = msg.after ?? undefined;

      const result = await api.users.getBlocks(moderatorId, { limit, after });

      return {
        data: result.data.map((block: any) => ({
          userId: block.userId,
          userLogin: block.userLogin,
          displayName: block.displayName,
        })),
        cursor: result.cursor ?? null,
      };
    },
  }),

  defineHelix({
    type: 'twitch-helix-update-user-description',
    label: 'update bio',
    help: 'Updates the channel description of the authenticated Twitch user.',
    scopes: ['user:edit'],
    fields: [
      {
        name: 'description',
        label: 'Description',
        kind: 'string',
        default: '',
        faIcon: 'fa-info-circle',
        hint: 'Optional default description',
      },
    ],
    run: async ({ api, moderatorId, msg, config }) => {
      const description =
        (typeof msg.payload === 'string' ? msg.payload : msg.payload?.description) ??
        config.description ??
        '';
      return api.users.updateAuthenticatedUser(moderatorId, { description });
    },
    map: (user) => ({
      id: user.id,
      name: user.name,
      displayName: user.displayName,
      description: user.description,
      broadcasterType: user.broadcasterType,
      creationDate: user.creationDate,
    }),
  }),
];

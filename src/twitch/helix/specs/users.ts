import { defineHelix, type HelixField } from '../define';
import { mapUser } from '../twitch-helix-utils';

const broadcaster: HelixField = {
  name: 'broadcaster',
  label: 'Broadcaster',
  kind: 'user',
  optional: true,
  aliases: ['broadcasterId'],
  hint: 'blank = authenticated user',
  faIcon: 'fa-user',
};

function mapBlock(block: any) {
  return {
    userId: block.userId,
    userLogin: block.userLogin,
    displayName: block.displayName,
  };
}

export const userSpecs = [
  defineHelix({
    type: 'twitch-helix-get-users',
    tier: 'core',
    resource: 'users',
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
    type: 'twitch-helix-blocks',
    tier: 'core',
    resource: 'users',
    label: 'blocks',
    help: 'Blocks, unblocks or lists the users a channel has blocked.',
    scopes: ['user:read:blocked_users', 'user:manage:blocked_users'],
    fields: [broadcaster],
    defaultAction: 'list',
    actions: {
      list: {
        label: 'list',
        help: 'Lists the users the channel has blocked.',
        scopes: ['user:read:blocked_users'],
        paged: { limit: 20, max: 1000 },
        fields: [
          {
            name: 'user',
            label: 'User',
            kind: 'user',
            optional: true,
            aliases: ['targetUserId', 'targetUser'],
            faIcon: 'fa-search',
            hint: 'optional: check one user',
          },
        ],
        run: async ({ api, broadcasterId, input }) =>
          api.users.getBlocks(broadcasterId, { limit: input.limit, after: input.after }),
        map: (block) => mapBlock(block),
      },
      block: {
        label: 'block',
        help: 'Blocks a user.',
        scopes: ['user:manage:blocked_users'],
        fields: [
          {
            name: 'targetId',
            label: 'Target User',
            kind: 'user',
            required: true,
            hint: 'user ID or username to block',
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
          },
        ],
        run: async ({ api, broadcasterId, input, raw }) => {
          await api.users.createBlock(broadcasterId, input.targetId, {
            reason: input.reason,
            sourceContext: input.sourceContext,
          });
          return { broadcasterId, targetId: input.targetId, targetName: raw.targetId, blocked: true };
        },
      },
      unblock: {
        label: 'unblock',
        help: 'Removes a block from a user.',
        scopes: ['user:manage:blocked_users'],
        fields: [
          {
            name: 'targetId',
            label: 'Target User',
            kind: 'user',
            required: true,
            hint: 'user ID or username to unblock',
          },
        ],
        run: async ({ api, broadcasterId, input, raw }) => {
          await api.users.deleteBlock(broadcasterId, input.targetId);
          return { broadcasterId, targetId: input.targetId, targetName: raw.targetId, unblocked: true };
        },
      },
    },
  }),

  defineHelix({
    type: 'twitch-helix-get-authenticated-user',
    tier: 'core',
    resource: 'users',
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
    type: 'twitch-helix-update-user-description',
    tier: 'core',
    resource: 'users',
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

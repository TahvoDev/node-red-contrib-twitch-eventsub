import { getRawData } from '@twurple/common';
import { defineHelix, type HelixField, type HelixSpec } from '../define';
import { broadcaster, selfUser, triState } from './fields';
import { mapAutoModSettings, mapBitsEntry, mapBitsProduct, mapBlock, mapChannelReference, mapCharityAmount, mapClip, mapEditor, mapEntitlement, mapGame, mapGoal, mapHypeTrainEvent, mapMarker, mapModeratedChannel, mapPoll, mapPrediction, mapRedemption, mapReward, mapSearchResult, mapSegment, mapSharedChat, mapShieldMode, mapSubscription, mapTeam, mapTransaction, mapUnbanRequest, mapUserEmote, mapVideo, toPlainStream, toStringList } from './mappers';
import { MAX_TIMEOUT_SECONDS, clampLimit, fetchAllPages, firstDefined, mapAutoModStatus, mapBadgeSet, mapBan, mapBlockedTerm, mapChannel, mapChatSettings, mapChatter, mapEmote, mapFollowedChannel, mapFollower, mapSentMessage, mapUser, mapUserRelation, mapWarning, resolveAllMax, resolveAnnounceColor, resolveGameId, resolveUserId, toBool, toIdList, toInt, toStr } from '../twitch-helix-utils';

/**
 * The Helix endpoint registry: every endpoint the single `twitch-api` node can
 * run. Entries are plain data plus one twurple call; adding one is a new entry
 * here.
 */
const VALID_COMMERCIAL_LENGTHS = [30, 60, 90, 120, 150, 180];

const target: HelixField = {
  name: 'user',
  label: 'User',
  kind: 'user',
  required: true,
  aliases: ['targetUserId', 'targetUser'],
  hint: 'username or ID',
  faIcon: 'fa-user',
};

const optionalUser: HelixField = {
  name: 'user',
  label: 'User',
  kind: 'user',
  optional: true,
  aliases: ['targetUserId', 'targetUser'],
  hint: 'optional: check one user',
  faIcon: 'fa-search',
};

const AUTOMOD_LEVELS = [
  { value: '', label: 'leave unchanged' },
  { value: '0', label: 'Level 0 — no filtering' },
  { value: '1', label: 'Level 1 — discrimination, smart detection' },
  { value: '2', label: 'Level 2 — + sexual content, more harassment' },
  { value: '3', label: 'Level 3 — more filtering across the board' },
  { value: '4', label: 'Level 4 — most filtering (profanity, harassment)' },
];

/** The AutoMod category levels; 0-4, or blank to leave a category unchanged. */
const automodLevel = (name: string, label: string): HelixField => ({
  name,
  label,
  kind: 'select',
  default: '',
  options: AUTOMOD_LEVELS,
  faIcon: 'fa-sliders',
});

type Page = (cursor?: string) => Promise<{ data: any[]; cursor: string | null; total?: number }>;

const PERIODS = ['day', 'week', 'month', 'year', 'all'];

const REDEMPTION_STATUSES = ['UNFULFILLED', 'FULFILLED', 'CANCELED'];
const TARGET_STATUSES = ['FULFILLED', 'CANCELED'];
const enableOptions = triState();

const rewardIdField: HelixField = {
  name: 'rewardId',
  label: 'Reward ID',
  kind: 'string',
  default: '',
  hint: 'required',
  faIcon: 'fa-gift',
};

const segmentId: HelixField = {
  name: 'segmentId',
  label: 'Segment ID',
  kind: 'string',
  required: true,
  aliases: ['id'],
  faIcon: 'fa-hashtag',
};

/** The platform/integration specs: drops entitlements, extensions and content classification labels. */

export const HELIX_SPECS: HelixSpec[] = [
defineHelix({
    type: 'twitch-helix-get-users',
    tier: 'core',
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
        paged: { limit: 20 },
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
            aliases: ['userId', 'targetUserId', 'targetUser'],
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
            aliases: ['userId', 'targetUserId', 'targetUser'],
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

defineHelix({
    type: 'twitch-helix-get-channel-info',
    tier: 'core',
    label: 'get channel info',
    help: "Gets a channel's title, game, language and tags. Leave Broadcaster blank to use the authenticated account.",
    scopes: [],
    fields: [broadcaster],
    run: async ({ api, broadcasterId }) => {
      const channel = await api.channels.getChannelInfoById(broadcasterId);
      if (!channel) throw new Error(`Channel "${broadcasterId}" was not found on Twitch`);
      return channel;
    },
    map: (channel) => mapChannel(channel),
  }),

  defineHelix({
    type: 'twitch-helix-update-channel-info',
    tier: 'core',
    label: 'update channel info',
    help: "Updates a channel's title, game, tags or language. Only the fields you fill in are changed; the node fetches and returns the channel afterwards. The authenticated account must be the broadcaster.",
    scopes: ['channel:manage:broadcast'],
    fields: [
      broadcaster,
      {
        name: 'title',
        label: 'Title',
        kind: 'string',
        default: '',
        faIcon: 'fa-header',
        hint: 'blank = leave unchanged',
      },
      {
        name: 'game',
        label: 'Game',
        kind: 'string',
        default: '',
        aliases: ['gameId'],
        faIcon: 'fa-gamepad',
        hint: 'category name or ID',
      },
      {
        name: 'tags',
        label: 'Tags',
        kind: 'idList',
        default: '',
        faIcon: 'fa-tags',
        hint: 'comma separated, blank = leave unchanged',
      },
      {
        name: 'language',
        label: 'Language',
        kind: 'string',
        default: '',
        faIcon: 'fa-language',
        hint: 'e.g. en',
      },
      {
        name: 'labels',
        label: 'Content labels',
        kind: 'idList',
        default: '',
        aliases: ['contentClassificationLabels'],
        faIcon: 'fa-flag',
        hint: 'comma separated label IDs, blank = leave unchanged',
      },
      {
        name: 'delay',
        label: 'Delay (s)',
        kind: 'int',
        default: '',
        faIcon: 'fa-clock-o',
        hint: 'partners only, blank = leave unchanged',
      },
      {
        name: 'isBrandedContent',
        label: 'Branded content',
        kind: 'select',
        default: '',
        faIcon: 'fa-briefcase',
        options: triState(),
      },
    ],
    run: async ({ api, root, broadcasterId, input, raw }) => {
      const data: any = {};

      if (input.title !== undefined) data.title = input.title;
      if (input.game !== undefined) data.gameId = await resolveGameId(root, input.game);
      if (input.language !== undefined) data.language = input.language;
      if (input.tags.length) data.tags = input.tags;
      if (input.labels.length) data.contentClassificationLabels = input.labels;
      if (raw.delay !== undefined && input.delay !== undefined) data.delay = input.delay;
      const branded = toBool(input.isBrandedContent);
      if (branded !== undefined) data.isBrandedContent = branded;

      if (Object.keys(data).length === 0) {
        throw new Error('Nothing to update — set a title, game, tags, language, labels or delay');
      }

      await api.channels.updateChannelInfo(broadcasterId, data);

      const channel = await root.channels.getChannelInfoById(broadcasterId);
      if (!channel) throw new Error(`Channel "${broadcasterId}" was not found on Twitch`);

      return channel;
    },
    map: (channel) => mapChannel(channel),
  }),

  defineHelix({
    type: 'twitch-helix-get-followers',
    tier: 'core',
    label: 'get followers',
    help: "Lists a channel's followers, most recent first. Set User to a single login to just confirm whether that user follows. The authenticated account must be a moderator or the broadcaster.",
    scopes: ['moderator:read:followers'],
    paged: { limit: 20 },
    fields: [
      broadcaster,
      {
        name: 'user',
        label: 'User',
        kind: 'user',
        optional: true,
        faIcon: 'fa-search',
        hint: 'optional: check one follower',
      },
    ],
    run: async ({ api, broadcasterId, input }) =>
      api.channels.getChannelFollowers(broadcasterId, input.user, {
        limit: input.limit,
        after: input.after,
      }),
    map: (follower) => mapFollower(follower),
  }),

  defineHelix({
    type: 'twitch-helix-get-followed-channels',
    tier: 'core',
    label: 'get followed channels',
    help: 'Lists the channels the authenticated account follows. Set Channel to a single login to just confirm whether they follow it.',
    scopes: ['user:read:follows'],
    paged: { limit: 20 },
    fields: [
      {
        name: 'broadcaster',
        label: 'Channel',
        kind: 'user',
        optional: true,
        faIcon: 'fa-search',
        hint: 'optional: check one channel',
      },
    ],
    run: async ({ api, input, moderatorId }) =>
      api.channels.getFollowedChannels(moderatorId, input.broadcaster, {
        limit: input.limit,
        after: input.after,
      }),
    map: (channel) => mapFollowedChannel(channel),
  }),

  defineHelix({
    type: 'twitch-helix-ads',
    tier: 'extended',
    label: 'ads',
    help: 'Reads the ad schedule, snoozes the next ad or starts a commercial break.',
    scopes: ['channel:read:ads', 'channel:manage:ads', 'channel:edit:commercial'],
    fields: [broadcaster],
    defaultAction: 'get',
    actions: {
      get: {
        label: 'get schedule',
        help: 'Gets the ad schedule: available snoozes, next ad time and pre-roll free time.',
        scopes: ['channel:read:ads'],
        fields: [],
        run: async ({ api, broadcasterId }) => api.channels.getAdSchedule(broadcasterId),
        map: (schedule, { broadcasterId }) => ({
          broadcasterId,
          snoozeCount: schedule.snoozeCount,
          snoozeRefreshDate: schedule.snoozeRefreshDate ?? null,
          nextAdDate: schedule.nextAdDate ?? null,
          duration: schedule.duration,
          lastAdDate: schedule.lastAdDate ?? null,
          prerollFreeTime: schedule.prerollFreeTime,
        }),
      },
      snooze: {
        label: 'snooze',
        help: 'Snoozes the next ad when a snooze is available.',
        scopes: ['channel:manage:ads'],
        fields: [],
        run: async ({ api, broadcasterId }) => api.channels.snoozeNextAd(broadcasterId),
        map: (result, { broadcasterId }) => ({
          broadcasterId,
          snoozeCount: result.snoozeCount,
          snoozeRefreshDate: result.snoozeRefreshDate,
          nextAdDate: result.nextAdDate,
        }),
      },
      start: {
        label: 'start commercial',
        help: 'Starts a commercial break.',
        scopes: ['channel:edit:commercial'],
        fields: [
          {
            name: 'length',
            label: 'Length (s)',
            kind: 'int',
            default: 30,
            primary: true,
            aliases: ['commercialLength'],
            faIcon: 'fa-hourglass-half',
            hint: '30, 60, 90, 120, 150 or 180',
          },
        ],
        run: async ({ api, broadcasterId, input }) => {
          const length = input.length ?? 30;
          if (VALID_COMMERCIAL_LENGTHS.indexOf(length) === -1) {
            throw new Error(
              `Commercial length must be one of ${VALID_COMMERCIAL_LENGTHS.join(', ')} seconds`
            );
          }

          await api.channels.startChannelCommercial(broadcasterId, length);
          return { broadcasterId, length, started: true };
        },
      },
    },
  }),

  defineHelix({
    type: 'twitch-helix-get-stream-key',
    tier: 'advanced',
    label: 'get stream key',
    help: "Gets the channel's stream key. Treat the result as a secret. The authenticated account must be the broadcaster.",
    scopes: ['channel:read:stream_key'],
    fields: [broadcaster],
    run: async ({ api, broadcasterId }) => {
      const streamKey = await api.streams.getStreamKey(broadcasterId);
      return { streamKey, broadcasterId };
    },
  }),

  defineHelix({
    type: 'twitch-helix-channel-editors',
    tier: 'advanced',
    label: 'channel editors',
    help: 'Lists the editors of a channel.',
    scopes: ['channel:read:editors'],
    fields: [broadcaster],
    run: async ({ api, broadcasterId }) =>
      (await api.channels.getChannelEditors(broadcasterId)).map(mapEditor),
    extra: (payload) => ({ pagination: { cursor: null }, total: payload.length }),
  }),

defineHelix({
    type: 'twitch-helix-send-chat-message',
    tier: 'core',
    label: 'send chat message',
    help: 'Sends a chat message to a channel as the authenticated account.',
    scopes: ['user:write:chat'],
    fields: [
      {
        name: 'message',
        label: 'Message',
        kind: 'string',
        default: '',
        primary: true,
        faIcon: 'fa-comment',
        hint: 'msg.payload overrides this',
      },
      broadcaster,
    ],
    run: async ({ api, broadcasterId, input, msg }) => {
      const text = input.message ?? toStr(msg.text);
      if (!text) throw new Error('Message text is required — set msg.payload or the node message');
      const replyTo = toStr(firstDefined(msg.replyTo, msg.replyParentMessageId));
      return api.chat.sendChatMessage(
        broadcasterId,
        text,
        replyTo ? { replyParentMessageId: replyTo } : undefined
      );
    },
    map: mapSentMessage,
  }),

  defineHelix({
    type: 'twitch-helix-send-announcement',
    tier: 'core',
    label: 'send announcement',
    help: "Sends a highlighted announcement in a channel, falling back to primary for any other colour.",
    scopes: ['moderator:manage:announcements'],
    fields: [
      {
        name: 'message',
        label: 'Message',
        kind: 'string',
        default: '',
        primary: true,
        faIcon: 'fa-bullhorn',
        hint: 'msg.payload overrides this',
      },
      {
        name: 'color',
        label: 'Colour',
        kind: 'select',
        default: 'primary',
        faIcon: 'fa-paint-brush',
        options: [
          { value: 'primary', label: 'primary' },
          { value: 'blue', label: 'blue' },
          { value: 'green', label: 'green' },
          { value: 'orange', label: 'orange' },
          { value: 'purple', label: 'purple' },
        ],
      },
      broadcaster,
    ],
    run: async ({ api, broadcasterId, input, msg, config }) => {
      const text = input.message ?? toStr(msg.text);
      if (!text) throw new Error('Announcement text is required — set msg.payload or the node message');
      const color = resolveAnnounceColor(msg, config);
      await api.chat.sendAnnouncement(broadcasterId, { message: text, color });
      return { broadcasterId, message: text, color };
    },
  }),

  defineHelix({
    type: 'twitch-helix-send-shoutout',
    tier: 'core',
    label: 'send shoutout',
    help: 'Sends a shoutout from the authenticated channel to another.',
    scopes: ['moderator:manage:shoutouts'],
    fields: [
      {
        name: 'toBroadcaster',
        label: 'Shout out',
        kind: 'user',
        required: true,
        aliases: ['to'],
        faIcon: 'fa-bullhorn',
        hint: 'channel name or ID to shout out',
      },
    ],
    run: async ({ api, root, moderatorId, input, raw }) => {
      const fromId = moderatorId;
      const toId = input.toBroadcaster;
      if (!toId) throw new Error('Target broadcaster is required — set msg.to or the node field');

      const toUser = await root.users.getUserById(toId);
      await api.chat.shoutoutUser(fromId, toId);

      return {
        fromBroadcasterId: fromId,
        toBroadcasterId: toId,
        toBroadcasterName: toUser?.name ?? raw.toBroadcaster ?? null,
      };
    },
  }),

  defineHelix({
    type: 'twitch-helix-chat',
    tier: 'core',
    label: 'chat moderation',
    help: 'Lists the chatters in a channel, clears the chat or deletes a single message.',
    scopes: ['moderator:read:chatters', 'moderator:manage:chat_messages'],
    fields: [broadcaster],
    defaultAction: 'chatters',
    actions: {
      chatters: {
        label: 'chatters',
        help: "Lists the users currently in a channel's chat.",
        scopes: ['moderator:read:chatters'],
        paged: { limit: 20 },
        fields: [],
        run: async ({ api, broadcasterId, input }) =>
          api.chat.getChatters(broadcasterId, { limit: input.limit, after: input.after }),
        map: (chatter) => mapChatter(chatter),
      },
      clear: {
        label: 'clear',
        help: "Clears every message from a channel's chat.",
        scopes: ['moderator:manage:chat_messages'],
        fields: [],
        run: async ({ api, broadcasterId }) => {
          await api.moderation.deleteChatMessages(broadcasterId);
          return { broadcasterId, cleared: true };
        },
      },
      delete: {
        label: 'delete message',
        help: 'Deletes one chat message.',
        scopes: ['moderator:manage:chat_messages'],
        fields: [
          {
            name: 'messageId',
            label: 'Message ID',
            kind: 'string',
            default: '',
            aliases: ['id'],
            faIcon: 'fa-comment-o',
            hint: 'msg.messageId or msg.id overrides this',
          },
        ],
        run: async ({ api, broadcasterId, input, msg }) => {
          const messageId = input.messageId ?? toStr(msg.id);
          if (!messageId) throw new Error('Message ID is required — set msg.messageId or msg.id');

          await api.moderation.deleteChatMessages(broadcasterId, messageId);
          return { broadcasterId, messageId, deleted: true };
        },
      },
    },
  }),

  defineHelix({
    type: 'twitch-helix-chat-settings',
    tier: 'extended',
    label: 'chat settings',
    help: "Reads or changes a channel's chat settings.",
    scopes: ['moderator:manage:chat_settings'],
    fields: [broadcaster],
    defaultAction: 'get',
    actions: {
      get: {
        label: 'get',
        help: 'Gets the chat settings, including the non-moderator delay.',
        scopes: [],
        fields: [],
        run: async ({ api, broadcasterId }) => api.chat.getSettingsPrivileged(broadcasterId),
        map: (settings) => mapChatSettings(settings, true),
      },
      update: {
        label: 'update',
        help: 'Changes only the chat settings you set, leaving the rest unchanged.',
        scopes: ['moderator:manage:chat_settings'],
        fields: [
          {
            name: 'slowMode',
            label: 'Slow mode',
            kind: 'select',
            default: '',
            faIcon: 'fa-clock-o',
            options: triState(),
          },
          {
            name: 'slowModeDelay',
            label: 'Slow delay (s)',
            kind: 'int',
            default: '',
            faIcon: 'fa-hourglass-half',
            hint: 'leave blank to keep',
          },
          {
            name: 'followerOnlyMode',
            label: 'Followers only',
            kind: 'select',
            default: '',
            faIcon: 'fa-users',
            options: triState(),
          },
          {
            name: 'followerOnlyModeDelay',
            label: 'Follower delay (min)',
            kind: 'int',
            default: '',
            faIcon: 'fa-hourglass-half',
            hint: 'leave blank to keep',
          },
          {
            name: 'subscriberOnlyMode',
            label: 'Subscribers only',
            kind: 'select',
            default: '',
            faIcon: 'fa-star',
            options: triState(),
          },
          {
            name: 'emoteOnlyMode',
            label: 'Emote only',
            kind: 'select',
            default: '',
            faIcon: 'fa-smile-o',
            options: triState(),
          },
          {
            name: 'uniqueChatMode',
            label: 'Unique chat',
            kind: 'select',
            default: '',
            faIcon: 'fa-commenting-o',
            options: triState(),
          },
          {
            name: 'nonModeratorChatDelay',
            label: 'Non-mod delay',
            kind: 'select',
            default: '',
            faIcon: 'fa-clock-o',
            options: triState(),
          },
          {
            name: 'nonModeratorChatDelayDuration',
            label: 'Non-mod delay (s)',
            kind: 'int',
            default: '',
            faIcon: 'fa-hourglass-half',
            hint: 'leave blank to keep',
          },
        ],
        run: async ({ api, broadcasterId, input }) => {
          const settings: any = {};
          const flag = (key: string, value: unknown) => {
            const b = toBool(value);
            if (b !== undefined) settings[key] = b;
          };
          const num = (key: string, value: unknown) => {
            const n = toInt(value);
            if (n !== undefined) settings[key] = n;
          };

          flag('slowModeEnabled', input.slowMode);
          num('slowModeDelay', input.slowModeDelay);
          flag('followerOnlyModeEnabled', input.followerOnlyMode);
          num('followerOnlyModeDelay', input.followerOnlyModeDelay);
          flag('subscriberOnlyModeEnabled', input.subscriberOnlyMode);
          flag('emoteOnlyModeEnabled', input.emoteOnlyMode);
          flag('uniqueChatModeEnabled', input.uniqueChatMode);
          flag('nonModeratorChatDelayEnabled', input.nonModeratorChatDelay);
          num('nonModeratorChatDelay', input.nonModeratorChatDelayDuration);

          if (Object.keys(settings).length === 0) {
            throw new Error('Nothing to update — set at least one chat setting');
          }

          const updated = await api.chat.updateSettings(broadcasterId, settings);
          return mapChatSettings(updated, true);
        },
      },
    },
  }),

  defineHelix({
    type: 'twitch-helix-emotes',
    tier: 'core',
    label: 'get emotes',
    help: "Lists a channel's emotes or Twitch's global emotes.",
    scopes: [],
    context: 'app',
    fields: [
      {
        name: 'source',
        label: 'Emotes',
        kind: 'select',
        default: 'channel',
        faIcon: 'fa-list',
        options: [
          { value: 'channel', label: 'channel' },
          { value: 'global', label: 'global' },
        ],
      },
      broadcaster,
    ],
    run: async ({ api, broadcasterId, input }) => {
      if (input.source === 'global') {
        return (await api.chat.getGlobalEmotes()).map(mapEmote);
      }
      return (await api.chat.getChannelEmotes(broadcasterId)).map(mapEmote);
    },
  }),

  defineHelix({
    type: 'twitch-helix-chat-badges',
    tier: 'core',
    label: 'get chat badges',
    help: "Lists a channel's custom chat badges or Twitch's global badges.",
    scopes: [],
    context: 'app',
    fields: [
      {
        name: 'source',
        label: 'Badges',
        kind: 'select',
        default: 'channel',
        faIcon: 'fa-list',
        options: [
          { value: 'channel', label: 'channel' },
          { value: 'global', label: 'global' },
        ],
      },
      broadcaster,
    ],
    run: async ({ api, broadcasterId, input }) => {
      if (input.source === 'global') {
        return (await api.chat.getGlobalBadges()).map(mapBadgeSet);
      }
      return (await api.chat.getChannelBadges(broadcasterId)).map(mapBadgeSet);
    },
  }),

  defineHelix({
    type: 'twitch-helix-chat-color',
    tier: 'extended',
    label: 'chat colour',
    help: "Reads or changes a user's chat colour.",
    scopes: ['user:manage:chat_color'],
    fields: [
      {
        name: 'user',
        label: 'User',
        kind: 'user',
        optional: true,
        primary: true,
        aliases: ['userId'],
        hint: 'blank = authenticated user',
        faIcon: 'fa-user',
      },
    ],
    defaultAction: 'get',
    actions: {
      get: {
        label: 'get',
        help: "Gets a user's chat colour.",
        scopes: [],
        fields: [],
        run: async ({ api, moderatorId, input }) => {
          const user = input.user ?? moderatorId;
          const color = await api.chat.getColorForUser(user);
          return { userId: user, color: color ?? null };
        },
      },
      set: {
        label: 'set',
        help: 'Sets a user chat colour; a named Twitch colour or #RRGGBB.',
        scopes: ['user:manage:chat_color'],
        fields: [
          {
            name: 'color',
            label: 'Colour',
            kind: 'string',
            default: '',
            required: true,
            hint: 'e.g. blue, hot_pink or #9147ff',
            faIcon: 'fa-paint-brush',
          },
        ],
        run: async ({ api, moderatorId, input }) => {
          const user = input.user ?? moderatorId;
          const color = toStr(input.color);
          if (!color) throw new Error('A colour is required — named colour or #RRGGBB');
          await api.chat.setColorForUser(user, color as any);
          return { userId: user, color };
        },
      },
    },
  }),

  defineHelix({
    type: 'twitch-helix-user-emotes',
    tier: 'extended',
    label: 'user emotes',
    help: "Lists the emotes a user can use, including their channel's emotes.",
    scopes: ['user:read:emotes'],
    paged: { limit: 20 },
    fields: [
      selfUser,
    ],
    run: async ({ api, moderatorId, input }) =>
      api.chat.getUserEmotes(input.user ?? moderatorId, {
        limit: input.limit,
        after: input.after,
      }),
    map: (emote) => mapUserEmote(emote),
  }),

  defineHelix({
    type: 'twitch-helix-shared-chat',
    tier: 'extended',
    label: 'shared chat',
    help: 'Gets the shared chat session a channel is currently part of, or null.',
    scopes: [],
    fields: [broadcaster],
    run: async ({ api, broadcasterId }) => api.chat.getSharedChatSession(broadcasterId),
    map: (session) => mapSharedChat(session),
  }),

defineHelix({
    type: 'twitch-helix-bans',
    tier: 'core',
    label: 'bans',
    help: 'Bans, times out, unbans or lists banned users in a channel. Leave Duration blank for a permanent ban.',
    scopes: ['moderator:manage:banned_users', 'moderation:read'],
    fields: [broadcaster],
    defaultAction: 'ban',
    actions: {
      ban: {
        label: 'ban / timeout',
        help: 'Bans or times out a user (duration in seconds, capped at two weeks).',
        scopes: ['moderator:manage:banned_users'],
        fields: [
          { ...target, hint: 'username or ID to ban', faIcon: 'fa-gavel' },
          { name: 'reason', label: 'Reason', kind: 'string', default: '', hint: 'optional', faIcon: 'fa-comment' },
          { name: 'duration', label: 'Duration (seconds)', kind: 'int', default: '', hint: 'blank = permanent ban', faIcon: 'fa-hourglass-half' },
        ],
        run: async ({ api, broadcasterId, input, raw }) => {
          let duration: number | undefined;
          if (raw.duration !== undefined) {
            const parsed = input.duration;
            if (parsed === undefined || parsed <= 0) {
              throw new Error('Duration must be a positive number of seconds, or blank for a permanent ban');
            }
            duration = Math.min(parsed, MAX_TIMEOUT_SECONDS);
          }
          return api.moderation.banUser(broadcasterId, {
            user: input.user,
            reason: input.reason ?? '',
            duration,
          });
        },
        map: (result) => {
          const ban = Array.isArray(result) ? result[0] : result;
          if (!ban) throw new Error('Twitch did not confirm the ban');
          return mapBan(ban);
        },
      },
      unban: {
        label: 'unban',
        help: 'Removes a ban or timeout from a user.',
        scopes: ['moderator:manage:banned_users'],
        fields: [{ ...target, hint: 'username or ID to unban', faIcon: 'fa-unlock' }],
        run: async ({ api, broadcasterId, input }) => {
          await api.moderation.unbanUser(broadcasterId, input.user);
          return { broadcasterId, userId: input.user, unbanned: true };
        },
      },
      list: {
        label: 'list',
        help: "Lists a channel's banned and timed-out users, optionally filtered to one user.",
        scopes: ['moderation:read'],
        paged: { limit: 20 },
        fields: [optionalUser],
        run: async ({ api, broadcasterId, input }) =>
          api.moderation.getBannedUsers(broadcasterId, {
            userId: input.user,
            limit: input.limit,
            after: input.after,
          }),
        map: (ban) => mapBan(ban),
      },
    },
  }),

  defineHelix({
    type: 'twitch-helix-moderators',
    tier: 'extended',
    label: 'moderators',
    help: 'Lists, adds or removes a channel moderator.',
    scopes: ['moderation:read', 'channel:manage:moderators'],
    fields: [broadcaster],
    defaultAction: 'list',
    actions: {
      list: {
        label: 'list',
        help: "Lists a channel's moderators, optionally filtered to one user.",
        scopes: ['moderation:read'],
        paged: { limit: 20 },
        fields: [optionalUser],
        run: async ({ api, broadcasterId, input }) =>
          api.moderation.getModerators(broadcasterId, {
            userId: input.user,
            limit: input.limit,
            after: input.after,
          }),
        map: (moderator) => mapChatter(moderator),
      },
      add: {
        label: 'add',
        help: 'Gives a user moderator status in a channel.',
        scopes: ['channel:manage:moderators'],
        fields: [{ ...target, hint: 'username or ID to make moderator', faIcon: 'fa-shield' }],
        run: async ({ api, broadcasterId, input }) => {
          await api.moderation.addModerator(broadcasterId, input.user);
          return { broadcasterId, userId: input.user, added: true };
        },
      },
      remove: {
        label: 'remove',
        help: "Removes a user's moderator status in a channel.",
        scopes: ['channel:manage:moderators'],
        fields: [{ ...target, hint: 'username or ID to demote', faIcon: 'fa-shield' }],
        run: async ({ api, broadcasterId, input }) => {
          await api.moderation.removeModerator(broadcasterId, input.user);
          return { broadcasterId, userId: input.user, removed: true };
        },
      },
    },
  }),

  defineHelix({
    type: 'twitch-helix-vips',
    tier: 'extended',
    label: 'vips',
    help: 'Lists, adds or removes a channel VIP.',
    scopes: ['channel:read:vips', 'channel:manage:vips'],
    fields: [broadcaster],
    defaultAction: 'list',
    actions: {
      list: {
        label: 'list',
        help: "Lists a channel's VIPs.",
        scopes: ['channel:read:vips'],
        paged: { limit: 20 },
        fields: [],
        run: async ({ api, broadcasterId, input }) =>
          api.channels.getVips(broadcasterId, { limit: input.limit, after: input.after }),
        map: (vip) => mapUserRelation(vip),
      },
      add: {
        label: 'add',
        help: 'Gives a user VIP status in a channel.',
        scopes: ['channel:manage:vips'],
        fields: [{ ...target, hint: 'username or ID to make VIP', faIcon: 'fa-star' }],
        run: async ({ api, broadcasterId, input }) => {
          await api.channels.addVip(broadcasterId, input.user);
          return { broadcasterId, userId: input.user, added: true };
        },
      },
      remove: {
        label: 'remove',
        help: "Removes a user's VIP status in a channel.",
        scopes: ['channel:manage:vips'],
        fields: [{ ...target, hint: 'username or ID to demote', faIcon: 'fa-star-o' }],
        run: async ({ api, broadcasterId, input }) => {
          await api.channels.removeVip(broadcasterId, input.user);
          return { broadcasterId, userId: input.user, removed: true };
        },
      },
    },
  }),

  defineHelix({
    type: 'twitch-helix-blocked-terms',
    tier: 'extended',
    label: 'blocked terms',
    help: "Lists, adds or removes terms blocked in a channel's chat.",
    scopes: ['moderator:read:blocked_terms', 'moderator:manage:blocked_terms'],
    fields: [broadcaster],
    defaultAction: 'list',
    actions: {
      list: {
        label: 'list',
        help: "Lists the terms blocked in a channel's chat.",
        scopes: ['moderator:read:blocked_terms'],
        paged: { limit: 20 },
        fields: [],
        run: async ({ api, broadcasterId, input }) =>
          api.moderation.getBlockedTerms(broadcasterId, { limit: input.limit, after: input.after }),
        map: (term) => mapBlockedTerm(term),
      },
      add: {
        label: 'add',
        help: 'Adds a blocked term to a channel; matching messages are held for review.',
        scopes: ['moderator:manage:blocked_terms'],
        fields: [
          { name: 'term', label: 'Term', kind: 'string', default: '', primary: true, required: true, aliases: ['text'], hint: 'msg.payload overrides this', faIcon: 'fa-ban' },
        ],
        run: async ({ api, broadcasterId, input }) =>
          api.moderation.addBlockedTerm(broadcasterId, input.term),
        map: (result) => {
          const created = Array.isArray(result) ? result[0] : result;
          if (!created) throw new Error('Twitch did not confirm the blocked term');
          return mapBlockedTerm(created);
        },
      },
      remove: {
        label: 'remove',
        help: "Removes a blocked term from a channel's chat.",
        scopes: ['moderator:manage:blocked_terms'],
        fields: [
          { name: 'termId', label: 'Term ID', kind: 'string', default: '', required: true, aliases: ['id'], hint: 'msg.termId or msg.id overrides this', faIcon: 'fa-hashtag' },
        ],
        run: async ({ api, broadcasterId, moderatorId, input }) => {
          await api.moderation.removeBlockedTerm(broadcasterId, moderatorId, input.termId);
          return { broadcasterId, termId: input.termId, removed: true };
        },
      },
    },
  }),

  defineHelix({
    type: 'twitch-helix-moderation',
    tier: 'extended',
    label: 'moderation tools',
    help: 'Warns a user or checks messages against AutoMod.',
    scopes: ['moderator:manage:warnings', 'moderation:read'],
    fields: [broadcaster],
    defaultAction: 'warn',
    actions: {
      warn: {
        label: 'warn',
        help: 'Issues a warning to a user that they must acknowledge before chatting again.',
        scopes: ['moderator:manage:warnings'],
        fields: [
          { ...target, hint: 'username or ID to warn', faIcon: 'fa-exclamation-triangle' },
          { name: 'reason', label: 'Reason', kind: 'string', default: '', hint: 'shown to the user', faIcon: 'fa-comment' },
        ],
        run: async ({ api, broadcasterId, input }) =>
          api.moderation.warnUser(broadcasterId, input.user, input.reason ?? ''),
        map: (warning) => mapWarning(warning),
      },
      automod: {
        label: 'check automod',
        help: 'Asks Twitch whether messages would be approved or held by AutoMod, without posting them.',
        scopes: ['moderation:read'],
        fields: [
          { name: 'message', label: 'Message', kind: 'string', default: '', primary: true, optional: true, aliases: ['text'], hint: 'msg.payload overrides this', faIcon: 'fa-comment' },
        ],
        run: async ({ api, broadcasterId, msg, config }) => {
          const raw = firstDefined(
            typeof msg.payload === 'string' || Array.isArray(msg.payload) ? msg.payload : undefined,
            msg.message,
            msg.text,
            config.message
          );
          const messages = (Array.isArray(raw) ? raw : [raw])
            .map((value: unknown) => toStr(value))
            .filter((value): value is string => Boolean(value));
          if (!messages.length) throw new Error('A message to check is required — set msg.payload');

          const data = messages.map((text: string, index: number) => ({
            messageId: `msg-${index + 1}`,
            messageText: text,
          }));
          return api.moderation.checkAutoModStatus(broadcasterId, data);
        },
        map: (result) => {
          const mapped = (result ?? []).map(mapAutoModStatus);
          return mapped.length === 1 ? mapped[0] : mapped;
        },
      },
      moderated: {
        label: 'moderated channels',
        help: 'Lists the channels a user moderates.',
        scopes: ['user:read:moderated_channels'],
        paged: { limit: 20 },
        fields: [
          {
            name: 'user',
            label: 'Moderator',
            kind: 'user',
            optional: true,
            aliases: ['userId'],
            hint: 'blank = authenticated user',
          },
        ],
        run: async ({ api, moderatorId, input }) =>
          api.moderation.getModeratedChannels(input.user ?? moderatorId, {
            limit: input.limit,
            after: input.after,
          }),
        map: (channel) => mapModeratedChannel(channel),
      },
      checkBan: {
        label: 'check ban',
        help: 'Checks whether a user is banned in the channel.',
        scopes: ['moderation:read'],
        fields: [target],
        run: async ({ api, broadcasterId, input }) => ({
          userId: input.user,
          isBanned: await api.moderation.checkUserBan(broadcasterId, input.user),
        }),
      },
      checkMod: {
        label: 'check moderator',
        help: 'Checks whether a user is a moderator of the channel.',
        scopes: ['moderation:read'],
        fields: [target],
        run: async ({ api, broadcasterId, input }) => ({
          userId: input.user,
          isModerator: await api.moderation.checkUserMod(broadcasterId, input.user),
        }),
      },
    },
  }),

  defineHelix({
    type: 'twitch-helix-automod',
    tier: 'extended',
    label: 'automod',
    help: 'Reads or updates AutoMod settings, or approves/denies a held message.',
    scopes: [
      'moderator:read:automod_settings',
      'moderator:manage:automod_settings',
      'moderator:manage:automod',
    ],
    fields: [broadcaster],
    defaultAction: 'settings',
    actions: {
      settings: {
        label: 'get settings',
        help: 'Gets the AutoMod category levels for a channel.',
        scopes: ['moderator:read:automod_settings'],
        fields: [],
        run: async ({ api, broadcasterId }) => api.moderation.getAutoModSettings(broadcasterId),
        map: (settings) => (settings ?? []).map(mapAutoModSettings),
      },
      update: {
        label: 'update settings',
        help: 'Changes the AutoMod category levels you set, leaving the rest unchanged. Levels run 0 (no filtering) to 4 (most filtering), with 1 to 3 rising in between.',
        scopes: ['moderator:manage:automod_settings'],
        fields: [
          automodLevel('overallLevel', 'Overall'),
          automodLevel('disability', 'Disability'),
          automodLevel('aggression', 'Aggression'),
          automodLevel('sexualitySexOrGender', 'Sexuality / sex / gender'),
          automodLevel('misogyny', 'Misogyny'),
          automodLevel('bullying', 'Bullying'),
          automodLevel('swearing', 'Swearing'),
          automodLevel('raceEthnicityOrReligion', 'Race / ethnicity / religion'),
          automodLevel('sexBasedTerms', 'Sex-based terms'),
        ],
        run: async ({ api, broadcasterId, input }) => {
          const data: any = {};
          for (const key of [
            'overallLevel',
            'disability',
            'aggression',
            'sexualitySexOrGender',
            'misogyny',
            'bullying',
            'swearing',
            'raceEthnicityOrReligion',
            'sexBasedTerms',
          ]) {
            if (input[key] !== undefined) data[key] = toInt(input[key]);
          }
          if (Object.keys(data).length === 0) {
            throw new Error('Nothing to update — set at least one AutoMod level');
          }
          const settings = await api.moderation.updateAutoModSettings(broadcasterId, data);
          return (settings ?? []).map(mapAutoModSettings);
        },
      },
      held: {
        label: 'held message',
        help: 'Approves or denies a message AutoMod is holding.',
        scopes: ['moderator:manage:automod'],
        fields: [
          {
            name: 'messageId',
            label: 'Message ID',
            kind: 'string',
            default: '',
            required: true,
            aliases: ['id'],
            hint: 'msg.messageId or msg.id overrides this',
            faIcon: 'fa-comment-o',
          },
          {
            name: 'allow',
            label: 'Decision',
            kind: 'select',
            default: 'true',
            options: [
              { value: 'true', label: 'approve' },
              { value: 'false', label: 'deny' },
            ],
          },
        ],
        run: async ({ api, moderatorId, input, msg }) => {
          const messageId = input.messageId ?? toStr(msg.id);
          if (!messageId) throw new Error('A message ID is required — set msg.messageId or msg.id');
          const allow = toBool(input.allow, true) === true;
          await api.moderation.processHeldAutoModMessage(moderatorId, messageId, allow);
          return { messageId, allow };
        },
      },
    },
  }),

  defineHelix({
    type: 'twitch-helix-shield-mode',
    tier: 'extended',
    label: 'shield mode',
    help: 'Reads or toggles Shield Mode on a channel.',
    scopes: ['moderator:read:shield_mode', 'moderator:manage:shield_mode'],
    fields: [broadcaster],
    defaultAction: 'get',
    actions: {
      get: {
        label: 'get',
        help: 'Gets the current Shield Mode status.',
        scopes: ['moderator:read:shield_mode'],
        fields: [],
        run: async ({ api, broadcasterId }) => api.moderation.getShieldModeStatus(broadcasterId),
        map: (status) => mapShieldMode(status),
      },
      update: {
        label: 'update',
        help: 'Activates or deactivates Shield Mode.',
        scopes: ['moderator:manage:shield_mode'],
        fields: [
          {
            name: 'active',
            label: 'Shield mode',
            kind: 'select',
            default: 'true',
            options: [
              { value: 'true', label: 'activate' },
              { value: 'false', label: 'deactivate' },
            ],
          },
        ],
        run: async ({ api, broadcasterId, input }) =>
          api.moderation.updateShieldModeStatus(broadcasterId, toBool(input.active, true) === true),
        map: (status) => mapShieldMode(status),
      },
    },
  }),

  defineHelix({
    type: 'twitch-helix-unban-requests',
    tier: 'extended',
    label: 'unban requests',
    help: 'Lists or resolves unban requests for a channel.',
    scopes: ['moderator:read:unban_requests', 'moderator:manage:unban_requests'],
    fields: [broadcaster],
    defaultAction: 'list',
    actions: {
      list: {
        label: 'list',
        help: 'Lists unban requests with a given status.',
        scopes: ['moderator:read:unban_requests'],
        paged: { limit: 20 },
        fields: [
          {
            name: 'status',
            label: 'Status',
            kind: 'select',
            default: 'pending',
            faIcon: 'fa-filter',
            options: [
              { value: 'pending', label: 'pending' },
              { value: 'approved', label: 'approved' },
              { value: 'denied', label: 'denied' },
              { value: 'acknowledged', label: 'acknowledged' },
              { value: 'canceled', label: 'canceled' },
            ],
          },
          {
            name: 'user',
            label: 'User',
            kind: 'user',
            optional: true,
            aliases: ['userId'],
            faIcon: 'fa-search',
            hint: 'optional: filter to one user',
          },
        ],
        run: async ({ api, broadcasterId, input }) =>
          api.moderation.getUnbanRequests(broadcasterId, input.status, {
            userId: input.user,
            limit: input.limit,
            after: input.after,
          }),
        map: (request) => mapUnbanRequest(request),
      },
      resolve: {
        label: 'resolve',
        help: 'Approves or denies an unban request, with an optional message.',
        scopes: ['moderator:manage:unban_requests'],
        fields: [
          {
            name: 'requestId',
            label: 'Request ID',
            kind: 'string',
            default: '',
            required: true,
            aliases: ['id'],
            hint: 'msg.unbanRequestId or msg.id overrides this',
            faIcon: 'fa-hashtag',
          },
          {
            name: 'approve',
            label: 'Decision',
            kind: 'select',
            default: 'true',
            options: [
              { value: 'true', label: 'approve' },
              { value: 'false', label: 'deny' },
            ],
          },
          {
            name: 'message',
            label: 'Resolution message',
            kind: 'string',
            default: '',
            hint: 'optional',
            faIcon: 'fa-comment',
          },
        ],
        run: async ({ api, broadcasterId, input }) =>
          api.moderation.resolveUnbanRequest(
            broadcasterId,
            input.requestId,
            toBool(input.approve, true) === true,
            input.message || undefined
          ),
        map: (request) => mapUnbanRequest(request),
      },
    },
  }),

defineHelix({
    type: 'twitch-helix-stream-markers',
    tier: 'extended',
    label: 'stream markers',
    help: 'Creates or lists stream markers. Creating needs a live stream and the broadcaster account.',
    scopes: ['channel:manage:broadcast', 'user:read:broadcast'],
    fields: [broadcaster],
    defaultAction: 'create',
    actions: {
      create: {
        label: 'create',
        help: "Adds a marker to a live stream at the current position. The channel's stream must be live.",
        scopes: ['channel:manage:broadcast'],
        fields: [
          {
            name: 'description',
            label: 'Description',
            kind: 'string',
            default: '',
            primary: true,
            faIcon: 'fa-comment',
            hint: 'msg.payload overrides this',
          },
        ],
        run: async ({ api, broadcasterId, input }) => {
          const marker = await api.streams.createStreamMarker(broadcasterId, input.description);
          return mapMarker(marker);
        },
      },
      list: {
        label: 'list',
        help: 'Lists the stream markers of a channel, optionally limited to a single video.',
        scopes: ['user:read:broadcast'],
        paged: { limit: 20 },
        fields: [
          {
            name: 'video',
            label: 'Video',
            kind: 'string',
            default: '',
            aliases: ['videoId'],
            faIcon: 'fa-video-camera',
            hint: 'optional: one video ID',
          },
        ],
        run: async ({ api, broadcasterId, input }) =>
          input.video
            ? api.streams.getStreamMarkersForVideo(broadcasterId, input.video, {
                limit: input.limit,
                after: input.after,
              })
            : api.streams.getStreamMarkersForUser(broadcasterId, {
                limit: input.limit,
                after: input.after,
              }),
        map: (marker) => mapMarker(marker),
      },
    },
  }),

  defineHelix({
    type: 'twitch-helix-clips',
    tier: 'core',
    label: 'clips',
    help: 'Creates a clip of a live stream or lists clips.',
    scopes: ['clips:edit'],
    fields: [],
    defaultAction: 'create',
    actions: {
      create: {
        label: 'create',
        help: 'Creates a clip of a running stream. The stream must be live.',
        scopes: ['clips:edit'],
        fields: [
          broadcaster,
          {
            name: 'createAfterDelay',
            label: 'Create after delay',
            kind: 'bool',
            default: false,
            faIcon: 'fa-clock-o',
            hint: 'account for the usual stream delay',
          },
        ],
        run: async ({ api, broadcasterId, input }) => {
          const createAfterDelay = input.createAfterDelay === true;
          const clipId = await api.clips.createClip({ channel: broadcasterId, createAfterDelay });
          return { id: clipId, broadcasterId, createAfterDelay };
        },
      },
      list: {
        label: 'list',
        help: "Lists clips by broadcaster, by clip IDs, or by game. When Clip IDs is set the IDs are looked up directly; otherwise a Game selects clips for that category, falling back to the broadcaster's clips.",
        scopes: [],
        fields: [
          broadcaster,
          {
            name: 'clipIds',
            label: 'Clip IDs',
            kind: 'idList',
            default: '',
            aliases: ['ids'],
            primary: true,
            faIcon: 'fa-scissors',
            hint: 'comma separated (takes priority)',
          },
          {
            name: 'game',
            label: 'Game',
            kind: 'string',
            default: '',
            aliases: ['gameId'],
            faIcon: 'fa-gamepad',
            hint: 'optional: category name or ID',
          },
          { name: 'limit', label: 'Limit', kind: 'int', default: 20, faIcon: 'fa-list-ol', hint: '1-100' },
          { name: 'all', label: 'Get all', kind: 'bool', default: false, faIcon: 'fa-download', hint: 'follows pages up to the maximum' },
          { name: 'allMax', label: 'Max', kind: 'int', default: '', faIcon: 'fa-arrow-up', hint: 'blank = every row, up to 50000' },
        ],
        run: async ({ api, root, broadcasterId, input, msg }) => {
          const limit = clampLimit(input.limit, 20);
          const after = firstDefined(msg.after, msg.cursor);

          const clipIds = input.clipIds ?? [];
          if (clipIds.length) {
            const clips = await api.clips.getClipsByIds(clipIds);
            return { payload: clips.map(mapClip), cursor: null, total: clips.length };
          }

          let fetchPage: Page;
          if (input.game) {
            const gameId = await resolveGameId(root, input.game);
            fetchPage = async (cursor?: string) => {
              const res = await api.clips.getClipsForGame(gameId, { limit, after: cursor ?? after });
              return { data: res.data, cursor: res.cursor ?? null, total: res.total };
            };
          } else {
            fetchPage = async (cursor?: string) => {
              const res = await api.clips.getClipsForBroadcaster(broadcasterId, { limit, after: cursor ?? after });
              return { data: res.data, cursor: res.cursor ?? null, total: res.total };
            };
          }

          const result =
            input.all === true ? await fetchAllPages(fetchPage, resolveAllMax(input.allMax)) : await fetchPage();
          return { payload: result.data.map(mapClip), cursor: result.cursor ?? null, total: result.total, truncated: input.all === true && result.cursor != null };
        },
        map: (result) => result.payload,
        extra: (result) => ({ pagination: { cursor: result.cursor ?? null }, total: result.total, ...(result.truncated ? { truncated: true } : {}) }),
      },
    },
  }),

  defineHelix({
    type: 'twitch-helix-videos',
    tier: 'extended',
    label: 'videos',
    help: 'Lists videos or deletes one or more videos by ID.',
    scopes: ['channel:manage:videos'],
    fields: [],
    defaultAction: 'list',
    actions: {
      list: {
        label: 'list',
        help: 'Lists videos by user or by video IDs, with optional type, period, sort and language filters. When Video IDs is set the IDs are looked up directly and the filters are ignored.',
        scopes: [],
        fields: [
          {
            name: 'user',
            label: 'User',
            kind: 'user',
            optional: true,
            default: '',
            aliases: ['userId'],
            primary: true,
            faIcon: 'fa-user',
            hint: 'blank = authenticated user',
          },
          {
            name: 'videoIds',
            label: 'Video IDs',
            kind: 'idList',
            default: '',
            aliases: ['ids'],
            primary: true,
            faIcon: 'fa-video-camera',
            hint: 'comma separated (takes priority)',
          },
          {
            name: 'type',
            label: 'Type',
            kind: 'select',
            default: '',
            aliases: ['videoType'],
            faIcon: 'fa-filter',
            options: [
              { value: '', label: 'any' },
              { value: 'all', label: 'all' },
              { value: 'upload', label: 'upload' },
              { value: 'archive', label: 'archive' },
              { value: 'highlight', label: 'highlight' },
            ],
          },
          {
            name: 'period',
            label: 'Period',
            kind: 'select',
            default: '',
            faIcon: 'fa-calendar',
            options: [
              { value: '', label: 'any' },
              { value: 'all', label: 'all' },
              { value: 'day', label: 'day' },
              { value: 'week', label: 'week' },
              { value: 'month', label: 'month' },
            ],
          },
          {
            name: 'sort',
            label: 'Sort',
            kind: 'select',
            default: '',
            aliases: ['orderBy'],
            faIcon: 'fa-sort',
            options: [
              { value: '', label: 'time (default)' },
              { value: 'time', label: 'time' },
              { value: 'trending', label: 'trending' },
              { value: 'views', label: 'views' },
            ],
          },
          { name: 'language', label: 'Language', kind: 'string', default: '', faIcon: 'fa-language', hint: 'optional, e.g. en' },
          { name: 'limit', label: 'Limit', kind: 'int', default: 20, faIcon: 'fa-list-ol', hint: '1-100' },
          { name: 'all', label: 'Get all', kind: 'bool', default: false, faIcon: 'fa-download', hint: 'follows pages up to the maximum' },
          { name: 'allMax', label: 'Max', kind: 'int', default: '', faIcon: 'fa-arrow-up', hint: 'blank = every row, up to 50000' },
        ],
        run: async ({ api, root, input, msg, config, moderatorId }) => {
          const limit = clampLimit(input.limit, 20);
          const after = firstDefined(msg.after, msg.cursor);

          const videoIds = input.videoIds ?? [];
          if (videoIds.length) {
            const videos = await api.videos.getVideosByIds(videoIds);
            return { payload: videos.map(mapVideo), cursor: null, total: videos.length };
          }

          let userId = input.user;
          if (!userId) {
            userId = await resolveUserId(root, firstDefined(toStr(config.broadcaster), moderatorId));
          }

          const filter: any = { limit, after };
          if (input.type) filter.type = input.type;
          if (input.period) filter.period = input.period;
          if (input.sort) filter.orderBy = input.sort;
          if (input.language) filter.language = input.language;

          const fetchPage: Page = async (cursor?: string) => {
            const res = await api.videos.getVideosByUser(userId, { ...filter, after: cursor ?? after });
            return { data: res.data, cursor: res.cursor ?? null, total: res.total };
          };

          const result =
            input.all === true ? await fetchAllPages(fetchPage, resolveAllMax(input.allMax)) : await fetchPage();
          return { payload: result.data.map(mapVideo), cursor: result.cursor ?? null, total: result.total, truncated: input.all === true && result.cursor != null };
        },
        map: (result) => result.payload,
        extra: (result) => ({ pagination: { cursor: result.cursor ?? null }, total: result.total, ...(result.truncated ? { truncated: true } : {}) }),
      },
      delete: {
        label: 'delete',
        help: 'Deletes one or more videos by ID. This cannot be undone.',
        scopes: ['channel:manage:videos'],
        fields: [
          broadcaster,
          {
            name: 'videoIds',
            label: 'Video IDs',
            kind: 'idList',
            default: '',
            aliases: ['ids'],
            primary: true,
            faIcon: 'fa-video-camera',
            hint: 'comma separated',
          },
        ],
        run: async ({ api, broadcasterId, input }) => {
          const videoIds = input.videoIds ?? [];
          if (!videoIds.length) {
            throw new Error('A video ID is required — set msg.videoIds or the node video IDs');
          }

          await api.videos.deleteVideosByIds(broadcasterId, videoIds);
          return { broadcasterId, deleted: videoIds, count: videoIds.length };
        },
      },
    },
  }),

  defineHelix({
    type: 'twitch-helix-games',
    tier: 'advanced',
    label: 'games',
    help: 'Looks up a game/category, lists the top games or searches categories.',
    scopes: [],
    fields: [],
    defaultAction: 'get',
    actions: {
      get: {
        label: 'get',
        help: 'Looks up a single game/category by name or numeric ID and returns its details.',
        scopes: [],
        fields: [
          {
            name: 'game',
            label: 'Game/category',
            kind: 'string',
            default: '',
            aliases: ['category', 'query'],
            primary: true,
            faIcon: 'fa-gamepad',
            hint: 'name or numeric ID',
          },
        ],
        run: async ({ root, input }) => {
          const query = input.game;
          if (!query) throw new Error('A game/category name or ID is required');

          const game = /^\d+$/.test(query)
            ? await root.games.getGameById(query)
            : await root.games.getGameByName(query);
          if (!game) throw new Error(`Twitch category "${query}" could not be found`);

          return mapGame(game);
        },
      },
      top: {
        label: 'top',
        help: 'Lists the most viewed games/categories on Twitch right now.',
        scopes: [],
        paged: { limit: 20 },
        fields: [],
        run: async ({ api, input }) =>
          api.games.getTopGames({ limit: input.limit, after: input.after }),
        map: (game) => mapGame(game),
      },
      search: {
        label: 'search',
        help: 'Searches games/categories by a partial or exact query.',
        scopes: [],
        paged: { limit: 20 },
        fields: [
          {
            name: 'query',
            label: 'Query',
            kind: 'string',
            default: '',
            aliases: ['search'],
            primary: true,
            faIcon: 'fa-search',
            hint: 'msg.payload overrides this',
          },
        ],
        run: async ({ api, input }) => {
          if (!input.query) throw new Error('A search query is required');
          return api.search.searchCategories(input.query, { limit: input.limit, after: input.after });
        },
        map: (game) => mapGame(game),
      },
    },
  }),

  defineHelix({
    type: 'twitch-helix-search',
    tier: 'advanced',
    label: 'search channels',
    help: 'Searches channels by a partial or exact query, optionally limited to live channels.',
    scopes: [],
    paged: { limit: 20 },
    fields: [
      {
        name: 'query',
        label: 'Query',
        kind: 'string',
        default: '',
        aliases: ['search'],
        primary: true,
        faIcon: 'fa-search',
        hint: 'msg.payload overrides this',
      },
      {
        name: 'liveOnly',
        label: 'Live only',
        kind: 'select',
        default: '',
        faIcon: 'fa-signal',
        options: [
          { value: '', label: 'any' },
          { value: 'true', label: 'live only' },
        ],
      },
    ],
    run: async ({ api, input }) => {
      if (!input.query) throw new Error('A search query is required');
      return api.search.searchChannels(input.query, {
        liveOnly: toBool(input.liveOnly) || undefined,
        limit: input.limit,
        after: input.after,
      });
    },
    map: (result) => mapSearchResult(result),
  }),

  defineHelix({
    type: 'twitch-helix-raids',
    tier: 'extended',
    label: 'raids',
    help: 'Starts or cancels a raid.',
    scopes: ['channel:manage:raids'],
    fields: [broadcaster],
    defaultAction: 'start',
    actions: {
      start: {
        label: 'start',
        help: 'Starts a raid from a live channel to another live channel.',
        scopes: ['channel:manage:raids'],
        fields: [
          {
            name: 'target',
            label: 'Target channel',
            kind: 'user',
            required: true,
            aliases: ['targetChannel', 'to'],
            primary: true,
            faIcon: 'fa-share',
            hint: 'username or ID',
          },
        ],
        run: async ({ api, broadcasterId, input }) => {
          const raid = await api.raids.startRaid(broadcasterId, input.target);
          return {
            fromBroadcasterId: broadcasterId,
            toBroadcasterId: input.target,
            creationDate: raid.creationDate,
            targetIsMature: raid.targetIsMature,
          };
        },
      },
      cancel: {
        label: 'cancel',
        help: 'Cancels a raid the channel has started.',
        scopes: ['channel:manage:raids'],
        fields: [],
        run: async ({ api, broadcasterId }) => {
          await api.raids.cancelRaid(broadcasterId);
          return { broadcasterId, cancelled: true };
        },
      },
    },
  }),

  defineHelix({
    type: 'twitch-helix-get-streams',
    tier: 'core',
    label: 'get streams',
    help: 'Fetches a list of active Twitch streams based on your configuration parameters.',
    scopes: [],
    fields: [
      { name: 'userId', label: 'User ID', kind: 'string', default: '', faIcon: 'fa-user', hint: 'e.g., 125328655' },
      { name: 'userName', label: 'User Name', kind: 'string', default: '', faIcon: 'fa-user-circle', hint: 'e.g., Neon_Woof' },
      { name: 'game', label: 'Game ID', kind: 'string', default: '', faIcon: 'fa-gamepad', hint: 'e.g., 509658' },
      {
        name: 'streamType',
        label: 'Stream type',
        kind: 'select',
        default: 'all',
        hidden: true,
        options: [
          { value: 'all', label: 'all' },
          { value: 'live', label: 'live' },
        ],
      },
      { name: 'limit', label: 'Limit', kind: 'int', default: '', faIcon: 'fa-list', hint: 'results per page (default 20, max 100)' },
    ],
    run: async ({ api, msg, config }) => {
      const filter: any = {};

      const userId = firstDefined(msg.userId, config.userId);
      if (userId) filter.userId = userId;

      const userName = firstDefined(msg.userName, config.userName);
      if (userName) filter.userName = userName;

      const game = firstDefined(msg.game, config.game);
      if (game) filter.game = game;

      const language = firstDefined(msg.language, config.language);
      if (language) filter.language = language;

      let streamType = firstDefined(msg.type, msg.streamType, config.streamType, 'all');
      if (streamType !== 'live' && streamType !== 'all') streamType = 'all';
      filter.type = streamType;

      const limit = firstDefined(msg.limit, config.limit, 20);
      if (limit) filter.limit = Number(limit);

      if (msg.after) filter.after = msg.after;
      if (msg.before) filter.before = msg.before;

      const result = await api.streams.getStreams(filter);
      return { data: result.data.map(toPlainStream), cursor: result.cursor ?? null };
    },
  }),

  defineHelix({
    type: 'twitch-helix-followed-streams',
    tier: 'extended',
    label: 'followed streams',
    help: 'Lists the live streams a user follows.',
    scopes: ['user:read:follows'],
    paged: { limit: 20 },
    fields: [
      selfUser,
    ],
    run: async ({ api, moderatorId, input }) =>
      api.streams.getFollowedStreams(input.user ?? moderatorId, {
        limit: input.limit,
        after: input.after,
      }),
    map: (stream) => toPlainStream(stream),
  }),

defineHelix({
    type: 'twitch-helix-bits',
    tier: 'advanced',
    label: 'bits',
    help: 'Gets the Bits leaderboard or the Bits cheermotes.',
    scopes: ['bits:read'],
    fields: [],
    defaultAction: 'leaderboard',
    actions: {
      leaderboard: {
        label: 'leaderboard',
        help: 'Gets the Bits leaderboard for a channel. Set Center on user to make sure one user appears with others ranked around them.',
        scopes: ['bits:read'],
        fields: [
          broadcaster,
          {
            name: 'count',
            label: 'Count',
            kind: 'int',
            default: 20,
            aliases: ['limit'],
            faIcon: 'fa-list-ol',
            hint: '1-100',
          },
          {
            name: 'period',
            label: 'Period',
            kind: 'select',
            default: '',
            faIcon: 'fa-calendar',
            options: [
              { value: '', label: 'Twitch default (all)' },
              { value: 'day', label: 'day' },
              { value: 'week', label: 'week' },
              { value: 'month', label: 'month' },
              { value: 'year', label: 'year' },
              { value: 'all', label: 'all' },
            ],
          },
          {
            name: 'startDate',
            label: 'Start date',
            kind: 'string',
            default: '',
            aliases: ['startingDate'],
            faIcon: 'fa-clock-o',
            hint: 'optional: RFC3339 date',
          },
          {
            name: 'user',
            label: 'Center on user',
            kind: 'user',
            optional: true,
            aliases: ['contextUser'],
            faIcon: 'fa-search',
            hint: 'optional: show one user',
          },
        ],
        run: async ({ api, broadcasterId, input, raw }) => {
          const count = clampLimit(input.count, 20);

          if (raw.period && PERIODS.indexOf(String(raw.period)) === -1) {
            throw new Error(`period must be one of ${PERIODS.join(', ')}`);
          }

          const startDateText = toStr(input.startDate);
          let startDate: Date | undefined;
          if (startDateText) {
            startDate = new Date(startDateText);
            if (Number.isNaN(startDate.getTime())) {
              throw new Error(`startDate "${startDateText}" is not a valid date`);
            }
          }

          const params: any = { count };
          if (input.period) params.period = input.period;
          if (startDate) params.startDate = startDate;
          if (input.user) params.contextUserId = input.user;

          return api.bits.getLeaderboard(broadcasterId, params);
        },
        map: (leaderboard) => (leaderboard?.entries ?? []).map(mapBitsEntry),
        extra: (leaderboard) => ({
          pagination: { cursor: null },
          total: leaderboard?.totalCount,
        }),
      },
      cheermotes: {
        label: 'cheermotes',
        help: "Lists the Bits cheermotes Twitch supports, including each tier's images. Leave Channel blank for global cheermotes, or set it to a channel to also include its custom cheermotes.",
        scopes: [],
        fields: [
          {
            name: 'broadcaster',
            label: 'Channel',
            kind: 'user',
            optional: true,
            primary: true,
            aliases: ['broadcasterId'],
            hint: 'blank = global cheermotes only',
            faIcon: 'fa-user',
          },
        ],
        run: async ({ api, input }) => {
          const list = await api.bits.getCheermotes(input.broadcaster);
          const raw = getRawData(list) as Record<string, any>;

          return Object.keys(raw).map((prefix) => {
            const cheermote = raw[prefix];
            return {
              prefix: cheermote.prefix ?? prefix,
              type: cheermote.type,
              order: cheermote.order,
              lastUpdated: cheermote.last_updated ?? null,
              tiers: (cheermote.tiers ?? []).map((tier: any) => ({
                minBits: tier.min_bits,
                id: tier.id,
                color: tier.color,
                canCheer: tier.can_cheer,
                showInBitsCard: tier.show_in_bits_card,
                images: tier.images,
              })),
            };
          });
        },
        extra: (payload) => ({ pagination: { cursor: null }, total: payload.length }),
      },
    },
  }),

  defineHelix({
    type: 'twitch-helix-subscriptions',
    tier: 'advanced',
    label: 'subscriptions',
    help: "Lists a channel's subscribers or checks one user's subscription.",
    scopes: ['channel:read:subscriptions', 'user:read:subscriptions'],
    fields: [broadcaster],
    defaultAction: 'list',
    actions: {
      list: {
        label: 'list',
        help: "Lists a channel's subscribers. Set User to check a single user instead, which returns that user's subscription if they have one.",
        scopes: ['channel:read:subscriptions'],
        paged: { limit: 20 },
        fields: [
          {
            name: 'user',
            label: 'User',
            kind: 'user',
            optional: true,
            faIcon: 'fa-search',
            hint: 'optional: check one subscriber',
          },
        ],
        run: async ({ api, broadcasterId, input }) => {
          if (input.user) {
            const subs = await api.subscriptions.getSubscriptionsForUsers(broadcasterId, [input.user]);
            return { data: subs, cursor: null, total: subs.length };
          }
          return api.subscriptions.getSubscriptions(broadcasterId, {
            limit: input.limit,
            after: input.after,
          });
        },
        map: (sub) => mapSubscription(sub),
      },
      check: {
        label: 'check',
        help: "Checks whether a user is subscribed to a channel, using the authenticated user's token. Blank User defaults to the authenticated account.",
        scopes: ['user:read:subscriptions'],
        fields: [
          { ...selfUser, primary: true, faIcon: 'fa-search' },
        ],
        run: async ({ api, broadcasterId, input, moderatorId }) => {
          const userId = input.user ?? moderatorId;

          const subscription = await api.subscriptions.checkUserSubscription(userId, broadcasterId);
          if (!subscription) return null;

          return {
            userId,
            broadcasterId: subscription.broadcasterId,
            broadcasterName: subscription.broadcasterName,
            broadcasterDisplayName: subscription.broadcasterDisplayName,
            isGift: subscription.isGift,
            tier: subscription.tier,
          };
        },
      },
    },
  }),

  defineHelix({
    type: 'twitch-helix-schedule',
    tier: 'extended',
    label: 'schedule',
    help: "Reads or changes a channel's streaming schedule segments.",
    scopes: ['channel:manage:schedule'],
    fields: [broadcaster],
    defaultAction: 'get',
    actions: {
      get: {
        label: 'get',
        help: "Gets a channel's streaming schedule as a list of segments.",
        scopes: [],
        paged: { limit: 20 },
        fields: [
          {
            name: 'startDate',
            label: 'From date',
            kind: 'string',
            default: '',
            faIcon: 'fa-calendar',
            hint: 'optional: RFC3339 date',
          },
          {
            name: 'utcOffset',
            label: 'UTC offset',
            kind: 'int',
            default: '',
            faIcon: 'fa-clock-o',
            hint: 'optional: minutes',
          },
        ],
        run: async ({ api, broadcasterId, input }) => {
          const filter: any = { limit: input.limit, after: input.after };
          if (input.startDate !== undefined) filter.startDate = input.startDate;
          if (input.utcOffset !== undefined) filter.utcOffset = input.utcOffset;

          const res = await api.schedule.getSchedule(broadcasterId, filter);
          return {
            data: res.data?.segments ?? [],
            cursor: res.cursor ?? null,
            total: undefined,
          };
        },
        map: (segment) => mapSegment(segment),
      },
      create: {
        label: 'create segment',
        help: "Adds a segment to a channel's streaming schedule. Twitch requires startDate (in UTC) and timezone; duration defaults to 240 minutes and isRecurring to false.",
        scopes: ['channel:manage:schedule'],
        fields: [
          {
            name: 'startDate',
            label: 'Start date (UTC)',
            kind: 'string',
            required: true,
            aliases: ['startTime'],
            faIcon: 'fa-calendar',
            hint: 'e.g. 2026-01-01T18:00:00Z',
          },
          {
            name: 'timezone',
            label: 'Timezone',
            kind: 'string',
            required: true,
            faIcon: 'fa-globe',
            hint: 'e.g. America/New_York',
          },
          {
            name: 'duration',
            label: 'Duration (min)',
            kind: 'int',
            default: '',
            faIcon: 'fa-hourglass-half',
            hint: 'optional: default 240',
          },
          {
            name: 'isRecurring',
            label: 'Recurring',
            kind: 'select',
            default: '',
            faIcon: 'fa-repeat',
            options: triState('no', 'weekly', 'no'),
          },
          {
            name: 'categoryId',
            label: 'Category',
            kind: 'string',
            default: '',
            aliases: ['category'],
            faIcon: 'fa-gamepad',
            hint: 'optional: category name or ID',
          },
          {
            name: 'title',
            label: 'Title',
            kind: 'string',
            default: '',
            primary: true,
            faIcon: 'fa-comment',
            hint: 'msg.payload overrides this',
          },
        ],
        run: async ({ api, root, broadcasterId, input }) => {
          const data: any = {
            startDate: input.startDate,
            timezone: input.timezone,
            isRecurring: toBool(input.isRecurring) === true,
          };
          if (input.duration !== undefined) data.duration = input.duration;
          if (input.categoryId !== undefined) {
            data.categoryId = await resolveGameId(root, input.categoryId);
          }
          if (input.title !== undefined) data.title = input.title;

          const segment = await api.schedule.createScheduleSegment(broadcasterId, data);
          return mapSegment(segment);
        },
      },
      update: {
        label: 'update segment',
        help: 'Changes an existing schedule segment. Only the fields you fill in are sent; leave a field blank to keep its current value.',
        scopes: ['channel:manage:schedule'],
        fields: [
          segmentId,
          {
            name: 'startDate',
            label: 'Start date (UTC)',
            kind: 'string',
            default: '',
            aliases: ['startTime'],
            faIcon: 'fa-calendar',
            hint: 'leave blank to keep',
          },
          {
            name: 'timezone',
            label: 'Timezone',
            kind: 'string',
            default: '',
            faIcon: 'fa-globe',
            hint: 'leave blank to keep',
          },
          {
            name: 'duration',
            label: 'Duration (min)',
            kind: 'int',
            default: '',
            faIcon: 'fa-hourglass-half',
            hint: 'leave blank to keep',
          },
          {
            name: 'isCanceled',
            label: 'Canceled',
            kind: 'select',
            default: '',
            faIcon: 'fa-ban',
            options: triState('leave unchanged', 'yes', 'no'),
          },
          {
            name: 'categoryId',
            label: 'Category',
            kind: 'string',
            default: '',
            aliases: ['category'],
            faIcon: 'fa-gamepad',
            hint: 'leave blank to keep',
          },
          {
            name: 'title',
            label: 'Title',
            kind: 'string',
            default: '',
            primary: true,
            faIcon: 'fa-comment',
            hint: 'leave blank to keep',
          },
        ],
        run: async ({ api, root, broadcasterId, input }) => {
          const data: any = {};
          if (input.startDate !== undefined) data.startDate = input.startDate;
          if (input.timezone !== undefined) data.timezone = input.timezone;
          if (input.duration !== undefined) data.duration = input.duration;
          if (input.categoryId !== undefined) {
            data.categoryId = await resolveGameId(root, input.categoryId);
          }
          if (input.title !== undefined) data.title = input.title;

          const isCanceled = toBool(input.isCanceled);
          if (isCanceled !== undefined) data.isCanceled = isCanceled;

          if (Object.keys(data).length === 0) {
            throw new Error('Nothing to update — set a startDate, timezone, duration, title or category');
          }

          const segment = await api.schedule.updateScheduleSegment(
            broadcasterId,
            input.segmentId,
            data
          );
          return mapSegment(segment);
        },
      },
      delete: {
        label: 'delete segment',
        help: "Removes a segment from a channel's schedule.",
        scopes: ['channel:manage:schedule'],
        fields: [segmentId],
        run: async ({ api, broadcasterId, input }) => {
          await api.schedule.deleteScheduleSegment(broadcasterId, input.segmentId);
          return { segmentId: input.segmentId, deleted: true };
        },
      },
      segment: {
        label: 'get segment',
        help: 'Gets a single schedule segment by ID.',
        scopes: [],
        fields: [segmentId],
        run: async ({ api, broadcasterId, input }) =>
          api.schedule.getScheduleSegmentById(broadcasterId, input.segmentId),
        map: (segment) => (segment ? mapSegment(segment) : null),
      },
      ical: {
        label: 'get ical',
        help: "Gets the channel's schedule as an iCalendar string.",
        scopes: [],
        fields: [],
        run: async ({ api, broadcasterId }) => api.schedule.getScheduleAsIcal(broadcasterId),
      },
      settings: {
        label: 'update settings',
        help: 'Sets or clears the schedule vacation. Blank dates clear it.',
        scopes: ['channel:manage:schedule'],
        fields: [
          {
            name: 'startDate',
            label: 'Vacation start (UTC)',
            kind: 'string',
            default: '',
            aliases: ['vacationStart'],
            faIcon: 'fa-calendar',
            hint: 'e.g. 2026-01-01T00:00:00Z',
          },
          {
            name: 'endDate',
            label: 'Vacation end (UTC)',
            kind: 'string',
            default: '',
            aliases: ['vacationEnd'],
            faIcon: 'fa-calendar',
            hint: 'e.g. 2026-01-08T00:00:00Z',
          },
          {
            name: 'timezone',
            label: 'Timezone',
            kind: 'string',
            default: '',
            aliases: ['vacationTimezone'],
            faIcon: 'fa-globe',
            hint: 'e.g. America/New_York',
          },
        ],
        run: async ({ api, broadcasterId, input }) => {
          const startDate = toStr(input.startDate);
          const endDate = toStr(input.endDate);
          const timezone = toStr(input.timezone);

          if (!startDate && !endDate && !timezone) {
            await api.schedule.updateScheduleSettings(broadcasterId, { vacation: null });
            return { vacation: null };
          }
          if (!startDate || !endDate || !timezone) {
            throw new Error('A vacation needs a start date, end date and timezone — or leave all blank to clear');
          }

          await api.schedule.updateScheduleSettings(broadcasterId, {
            vacation: { startDate, endDate, timezone },
          });
          return { vacation: { startDate, endDate, timezone } };
        },
      },
    },
  }),

  defineHelix({
    type: 'twitch-helix-teams',
    tier: 'advanced',
    label: 'teams',
    help: 'Looks up a Twitch team by ID or name, or lists the teams a channel belongs to.',
    scopes: [],
    fields: [],
    defaultAction: 'get',
    actions: {
      get: {
        label: 'get',
        help: 'Looks up a Twitch team by ID or name and returns its details and members. Twitch has no endpoint that lists every team, so supply an ID or name (a numeric msg.team is treated as an ID).',
        scopes: [],
        fields: [
          {
            name: 'teamId',
            label: 'Team ID',
            kind: 'string',
            default: '',
            faIcon: 'fa-hashtag',
            hint: 'look up by ID',
          },
          {
            name: 'teamName',
            label: 'Team name',
            kind: 'string',
            default: '',
            faIcon: 'fa-users',
            hint: 'look up by name',
          },
        ],
        run: async ({ root, input, msg }) => {
          const id = toStr(input.teamId);
          const name = toStr(input.teamName);
          const generic = toStr(firstDefined(msg.team, msg.payload));

          let team: any;
          if (id) {
            team = await root.teams.getTeamById(id);
          } else if (name) {
            team = await root.teams.getTeamByName(name);
          } else if (generic) {
            team = /^\d+$/.test(generic)
              ? await root.teams.getTeamById(generic)
              : await root.teams.getTeamByName(generic);
          } else {
            throw new Error('A team ID or name is required — set teamId, teamName or msg.team');
          }

          return team ? [mapTeam(team)] : [];
        },
        extra: (payload) => ({ pagination: { cursor: null }, total: payload.length }),
      },
      channel: {
        label: 'channel',
        help: 'Lists the Twitch teams a channel belongs to.',
        scopes: [],
        fields: [broadcaster],
        run: async ({ api, broadcasterId }) => {
          const teams = await api.teams.getTeamsForBroadcaster(broadcasterId);
          return teams.map(mapTeam);
        },
        extra: (teams) => ({ pagination: { cursor: null }, total: teams.length }),
      },
    },
  }),

  defineHelix({
    type: 'twitch-helix-charity',
    tier: 'advanced',
    label: 'charity',
    help: "Reads a channel's active charity campaign and its donations.",
    scopes: ['channel:read:charity'],
    fields: [broadcaster],
    defaultAction: 'campaign',
    actions: {
      campaign: {
        label: 'campaign',
        help: 'Gets the charity campaign a channel is currently running, or null when there is no active campaign.',
        scopes: ['channel:read:charity'],
        fields: [],
        run: async ({ api, broadcasterId }) => {
          const campaign = await api.charity.getCharityCampaign(broadcasterId);
          if (!getRawData(campaign)) return null;

          return {
            id: campaign.id,
            broadcasterId: campaign.broadcasterId,
            broadcasterName: campaign.broadcasterName,
            broadcasterDisplayName: campaign.broadcasterDisplayName,
            charityName: campaign.charityName,
            charityDescription: campaign.charityDescription,
            charityLogo: campaign.charityLogo,
            charityWebsite: campaign.charityWebsite,
            currentAmount: mapCharityAmount(campaign.currentAmount),
            targetAmount: mapCharityAmount(campaign.targetAmount),
          };
        },
      },
      donations: {
        label: 'donations',
        help: 'Lists the donations to the channel charity campaign.',
        scopes: ['channel:read:charity'],
        paged: { limit: 20 },
        fields: [],
        run: async ({ api, broadcasterId, input }) =>
          api.charity.getCharityCampaignDonations(broadcasterId, {
            limit: input.limit,
            after: input.after,
          }),
        map: (donation) => ({
          campaignId: donation.campaignId,
          donorId: donation.donorId,
          donorName: donation.donorName,
          donorDisplayName: donation.donorDisplayName,
          amount: mapCharityAmount(donation.amount),
        }),
      },
    },
  }),

  defineHelix({
    type: 'twitch-helix-hype-train',
    tier: 'advanced',
    label: 'get hype train',
    help: 'Gets Hype Train events for a channel. Twitch exposes no REST endpoint for the current Hype Train, so this returns the recorded events of the current or latest train (paginated), not a live snapshot.',
    scopes: ['channel:read:hype_train'],
    paged: { limit: 20 },
    fields: [broadcaster],
    run: async ({ api, broadcasterId, input }) =>
      api.hypeTrain.getHypeTrainEventsForBroadcaster(broadcasterId, {
        limit: input.limit,
        after: input.after,
      }),
    map: (event) => mapHypeTrainEvent(event),
  }),

  defineHelix({
    type: 'twitch-helix-goals',
    tier: 'advanced',
    label: 'get goals',
    help: "Gets a channel's active creator goals (follower and subscription targets).",
    scopes: ['channel:read:goals'],
    fields: [broadcaster],
    run: async ({ api, broadcasterId }) => {
      const goals = await api.goals.getGoals(broadcasterId);
      return goals.map(mapGoal);
    },
    extra: (payload) => ({ pagination: { cursor: null }, total: payload.length }),
  }),

  defineHelix({
    type: 'twitch-helix-whispers',
    tier: 'advanced',
    label: 'send whisper',
    help: 'Sends a whisper from the authenticated account to another user. Twitch may silently drop whispers it considers abusive, so a success only means the request was accepted.',
    scopes: ['user:manage:whispers'],
    fields: [
      {
        name: 'to',
        label: 'Recipient',
        kind: 'user',
        required: true,
        aliases: ['recipient', 'user'],
        faIcon: 'fa-user',
        hint: 'username or user ID',
      },
      {
        name: 'message',
        label: 'Message',
        kind: 'string',
        default: '',
        primary: true,
        required: true,
        aliases: ['text'],
        faIcon: 'fa-comment',
        hint: 'msg.payload overrides this',
      },
    ],
    run: async ({ api, moderatorId, input }) => {
      const toUserId = input.to;
      const message = input.message;
      if (!message) {
        throw new Error('Whisper text is required — set msg.payload or the node message');
      }

      await api.whispers.sendWhisper(moderatorId, toUserId, message);
      return { fromUserId: moderatorId, toUserId, sent: true };
    },
  }),

  defineHelix({
    type: 'twitch-helix-channel-points',
    tier: 'extended',
    label: 'channel points',
    help: 'Lists, creates, updates or deletes custom Channel Points rewards.',
    scopes: ['channel:read:redemptions', 'channel:manage:redemptions'],
    fields: [broadcaster],
    defaultAction: 'list',
    actions: {
      list: {
        label: 'list',
        help: "Lists a channel's custom Channel Points rewards.",
        scopes: ['channel:read:redemptions'],
        fields: [
          { name: 'rewardIds', label: 'Reward IDs', kind: 'idList', default: '', aliases: ['ids'], hint: 'optional: comma separated reward IDs', faIcon: 'fa-gift' },
          { name: 'onlyManageable', label: 'Manageable only', kind: 'bool', default: false, faIcon: 'fa-lock' },
          { name: 'limit', label: 'Limit', kind: 'int', default: 20, hint: '1-100', faIcon: 'fa-list-ol' },
          { name: 'all', label: 'Get all', kind: 'bool', default: false, hint: 'raise the cap to Max', faIcon: 'fa-download' },
          { name: 'allMax', label: 'Max', kind: 'int', default: '', faIcon: 'fa-arrow-up', hint: 'blank = every row, up to 50000' },
        ],
        run: async ({ api, broadcasterId, msg, config }) => {
          const limit = clampLimit(firstDefined(msg.limit, config.limit), 20);
          const getAll = toBool(firstDefined(msg.all, config.all), false) === true;
          const maxAll = resolveAllMax(firstDefined(msg.allMax, config.allMax));

          const rewardIds = toIdList(firstDefined(msg.rewardIds, msg.ids, config.rewardIds));
          if (rewardIds.length) {
            const rewards = await api.channelPoints.getCustomRewardsByIds(broadcasterId, rewardIds);
            return { data: rewards, cursor: null, total: rewards.length };
          }

          const onlyManageable =
            toBool(firstDefined(msg.onlyManageable, config.onlyManageable), false) === true;
          const rewards = await api.channelPoints.getCustomRewards(broadcasterId, onlyManageable);
          const out = getAll ? rewards.slice(0, maxAll) : rewards.slice(0, limit);
          return { data: out, cursor: null, total: rewards.length, truncated: getAll && rewards.length > out.length };
        },
        map: (result) => result.data.map(mapReward),
        extra: (result) => ({ pagination: { cursor: result.cursor }, total: result.total, ...(result.truncated ? { truncated: true } : {}) }),
      },
      create: {
        label: 'create',
        help: 'Creates a custom Channel Points reward. Only the fields you set are sent.',
        scopes: ['channel:manage:redemptions'],
        fields: [
          { name: 'title', label: 'Title', kind: 'string', default: '', primary: true, hint: 'msg.payload overrides this', faIcon: 'fa-gift' },
          { name: 'cost', label: 'Cost', kind: 'int', default: '', hint: 'channel points, required', faIcon: 'fa-star' },
          { name: 'prompt', label: 'Prompt', kind: 'string', default: '', hint: 'optional', faIcon: 'fa-comment' },
          {
            name: 'enabled',
            label: 'Enabled',
            kind: 'select',
            default: '',
            aliases: ['isEnabled'],
            faIcon: 'fa-toggle-on',
            options: triState('default (on)', 'on', 'off'),
          },
          { name: 'backgroundColor', label: 'Background', kind: 'string', default: '', hint: 'optional: #9147ff', faIcon: 'fa-paint-brush' },
          {
            name: 'userInputRequired',
            label: 'Needs input',
            kind: 'select',
            default: '',
            faIcon: 'fa-keyboard-o',
            options: triState('default', 'yes', 'no'),
          },
          { name: 'maxRedemptionsPerStream', label: 'Max per stream', kind: 'int', default: '', hint: 'blank = no limit', faIcon: 'fa-repeat' },
          { name: 'maxRedemptionsPerUserPerStream', label: 'Max per user', kind: 'int', default: '', hint: 'blank = no limit', faIcon: 'fa-user' },
          { name: 'globalCooldown', label: 'Cooldown (s)', kind: 'int', default: '', hint: 'blank = no cooldown', faIcon: 'fa-clock-o' },
          {
            name: 'autoFulfill',
            label: 'Auto-fulfil',
            kind: 'select',
            default: '',
            faIcon: 'fa-check',
            options: triState('default (off)', 'on', 'off'),
          },
        ],
        run: async ({ api, broadcasterId, input }) => {
          const title = toStr(input.title);
          if (!title) throw new Error('A reward title is required — set msg.payload or the node title');

          const cost = input.cost;
          if (cost === undefined || cost < 1) {
            throw new Error('A reward cost is required — set a positive number of channel points');
          }

          const data: any = { title, cost };
          if (input.prompt !== undefined) data.prompt = input.prompt;
          if (input.enabled !== undefined) data.isEnabled = toBool(input.enabled);
          if (input.backgroundColor !== undefined) data.backgroundColor = input.backgroundColor;
          if (input.userInputRequired !== undefined) data.userInputRequired = toBool(input.userInputRequired);
          if (input.maxRedemptionsPerStream !== undefined) data.maxRedemptionsPerStream = input.maxRedemptionsPerStream;
          if (input.maxRedemptionsPerUserPerStream !== undefined) {
            data.maxRedemptionsPerUserPerStream = input.maxRedemptionsPerUserPerStream;
          }
          if (input.globalCooldown !== undefined) data.globalCooldown = input.globalCooldown;
          if (input.autoFulfill !== undefined) data.autoFulfill = toBool(input.autoFulfill);

          const reward = await api.channelPoints.createCustomReward(broadcasterId, data);
          return mapReward(reward);
        },
      },
      update: {
        label: 'update',
        help: 'Updates a custom Channel Points reward. Only the fields you set are sent.',
        scopes: ['channel:manage:redemptions'],
        fields: [
          rewardIdField,
          { name: 'title', label: 'Title', kind: 'string', default: '', primary: true, hint: 'leave blank to keep; msg.payload overrides', faIcon: 'fa-font' },
          { name: 'cost', label: 'Cost', kind: 'int', default: '', hint: 'leave blank to keep', faIcon: 'fa-star' },
          { name: 'prompt', label: 'Prompt', kind: 'string', default: '', hint: 'leave blank to keep', faIcon: 'fa-comment' },
          { name: 'enabled', label: 'Enabled', kind: 'select', default: '', aliases: ['isEnabled'], faIcon: 'fa-toggle-on', options: enableOptions },
          {
            name: 'paused',
            label: 'Paused',
            kind: 'select',
            default: '',
            aliases: ['isPaused'],
            faIcon: 'fa-pause',
            options: triState('leave unchanged', 'paused', 'running'),
          },
          {
            name: 'userInputRequired',
            label: 'Needs input',
            kind: 'select',
            default: '',
            faIcon: 'fa-keyboard-o',
            options: triState('leave unchanged', 'yes', 'no'),
          },
          { name: 'backgroundColor', label: 'Background', kind: 'string', default: '', hint: 'leave blank to keep', faIcon: 'fa-paint-brush' },
          { name: 'maxRedemptionsPerStream', label: 'Max per stream', kind: 'int', default: '', hint: 'leave blank to keep', faIcon: 'fa-repeat' },
          { name: 'maxRedemptionsPerUserPerStream', label: 'Max per user', kind: 'int', default: '', hint: 'leave blank to keep', faIcon: 'fa-user' },
          { name: 'globalCooldown', label: 'Cooldown (s)', kind: 'int', default: '', hint: 'leave blank to keep', faIcon: 'fa-clock-o' },
          { name: 'autoFulfill', label: 'Auto-fulfil', kind: 'select', default: '', faIcon: 'fa-check', options: enableOptions },
        ],
        run: async ({ api, broadcasterId, input, raw, msg, config }) => {
          const rewardId = toStr(firstDefined(msg.rewardId, msg.reward, msg.id, config.rewardId));
          if (!rewardId) throw new Error('A reward ID is required — set msg.rewardId or the node field');

          const data: any = {};
          if (input.title !== undefined) data.title = input.title;

          if (raw.cost !== undefined) {
            const cost = toInt(raw.cost);
            if (cost === undefined || cost < 1) {
              throw new Error('Reward cost must be a positive number of channel points');
            }
            data.cost = cost;
          }

          if (input.prompt !== undefined) data.prompt = input.prompt;
          if (input.enabled !== undefined) data.isEnabled = toBool(input.enabled);
          if (input.backgroundColor !== undefined) data.backgroundColor = input.backgroundColor;
          if (input.userInputRequired !== undefined) data.userInputRequired = toBool(input.userInputRequired);
          if (input.maxRedemptionsPerStream !== undefined) data.maxRedemptionsPerStream = input.maxRedemptionsPerStream;
          if (input.maxRedemptionsPerUserPerStream !== undefined) {
            data.maxRedemptionsPerUserPerStream = input.maxRedemptionsPerUserPerStream;
          }
          if (input.globalCooldown !== undefined) data.globalCooldown = input.globalCooldown;
          if (input.autoFulfill !== undefined) data.autoFulfill = toBool(input.autoFulfill);
          if (input.paused !== undefined) data.isPaused = toBool(input.paused);

          if (Object.keys(data).length === 0) {
            throw new Error('Nothing to update — set at least one reward field');
          }

          const reward = await api.channelPoints.updateCustomReward(broadcasterId, rewardId, data);
          return mapReward(reward);
        },
      },
      delete: {
        label: 'delete',
        help: 'Deletes a custom Channel Points reward.',
        scopes: ['channel:manage:redemptions'],
        fields: [rewardIdField],
        run: async ({ api, broadcasterId, msg, config }) => {
          const rewardId = toStr(firstDefined(msg.rewardId, msg.reward, msg.id, config.rewardId));
          if (!rewardId) throw new Error('A reward ID is required — set msg.rewardId or the node field');

          await api.channelPoints.deleteCustomReward(broadcasterId, rewardId);
          return { rewardId, deleted: true };
        },
      },
    },
  }),

  defineHelix({
    type: 'twitch-helix-redemptions',
    tier: 'extended',
    label: 'redemptions',
    help: 'Lists custom Channel Points redemptions or updates their status.',
    scopes: ['channel:read:redemptions', 'channel:manage:redemptions'],
    fields: [broadcaster],
    defaultAction: 'list',
    actions: {
      list: {
        label: 'list',
        help: 'Lists redemptions of a custom Channel Points reward, newest first by default.',
        scopes: ['channel:read:redemptions'],
        paged: { limit: 20 },
        fields: [
          rewardIdField,
          {
            name: 'status',
            label: 'Status',
            kind: 'select',
            default: '',
            faIcon: 'fa-filter',
            options: [
              { value: '', label: 'unfulfilled (default)' },
              { value: 'UNFULFILLED', label: 'unfulfilled' },
              { value: 'FULFILLED', label: 'fulfilled' },
              { value: 'CANCELED', label: 'canceled' },
            ],
          },
        ],
        run: async ({ api, broadcasterId, input, msg, config }) => {
          const rewardId = toStr(firstDefined(msg.rewardId, msg.reward, config.rewardId));
          if (!rewardId) throw new Error('A reward ID is required — set msg.rewardId or the node field');

          const status = (toStr(firstDefined(msg.status, config.status)) ?? 'UNFULFILLED').toUpperCase();
          if (REDEMPTION_STATUSES.indexOf(status) === -1) {
            throw new Error(`Status must be one of ${REDEMPTION_STATUSES.join(', ')}`);
          }

          const newestFirst = toBool(firstDefined(msg.newestFirst, config.newestFirst));
          const filter: any = { limit: input.limit, after: input.after };
          if (newestFirst !== undefined) filter.newestFirst = newestFirst;

          return api.channelPoints.getRedemptionsForBroadcaster(broadcasterId, rewardId, status, filter);
        },
        map: (redemption) => mapRedemption(redemption),
      },
      update: {
        label: 'update',
        help: 'Marks one or more custom reward redemptions as fulfilled or canceled.',
        scopes: ['channel:manage:redemptions'],
        fields: [
          rewardIdField,
          { name: 'redemptionIds', label: 'Redemption IDs', kind: 'idList', default: '', hint: 'comma separated, required', faIcon: 'fa-tags' },
          {
            name: 'status',
            label: 'Status',
            kind: 'select',
            default: '',
            faIcon: 'fa-check',
            options: [
              { value: '', label: 'fulfilled (default)' },
              { value: 'FULFILLED', label: 'fulfilled' },
              { value: 'CANCELED', label: 'canceled' },
            ],
          },
        ],
        run: async ({ api, broadcasterId, msg, config }) => {
          const rewardId = toStr(firstDefined(msg.rewardId, msg.reward, config.rewardId));
          if (!rewardId) throw new Error('A reward ID is required — set msg.rewardId or the node field');

          const redemptionIds = toIdList(
            firstDefined(msg.redemptionIds, msg.redemptionId, msg.id, config.redemptionIds)
          );
          if (!redemptionIds.length) {
            throw new Error('A redemption ID is required — set msg.redemptionId or the node field');
          }

          const status = (toStr(firstDefined(msg.status, config.status)) ?? 'FULFILLED').toUpperCase();
          if (TARGET_STATUSES.indexOf(status) === -1) {
            throw new Error('Status must be either FULFILLED or CANCELED');
          }

          const updated = await api.channelPoints.updateRedemptionStatusByIds(
            broadcasterId,
            rewardId,
            redemptionIds,
            status
          );
          return updated.map(mapRedemption);
        },
      },
    },
  }),

  defineHelix({
    type: 'twitch-helix-polls',
    tier: 'extended',
    label: 'polls',
    help: 'Lists, creates or ends a channel poll.',
    scopes: ['channel:read:polls', 'channel:manage:polls'],
    fields: [broadcaster],
    defaultAction: 'list',
    actions: {
      list: {
        label: 'list',
        help: "Lists a channel's polls, most recent first, or fetches specific polls.",
        scopes: ['channel:read:polls'],
        fields: [
          { name: 'pollIds', label: 'Poll IDs', kind: 'idList', default: '', aliases: ['ids', 'pollId', 'id'], hint: 'optional: comma separated poll IDs', faIcon: 'fa-bar-chart' },
          { name: 'limit', label: 'Limit', kind: 'int', default: 20, hint: '1-100', faIcon: 'fa-list-ol' },
          { name: 'all', label: 'Get all', kind: 'bool', default: false, hint: 'follows pages up to the maximum', faIcon: 'fa-download' },
          { name: 'allMax', label: 'Max', kind: 'int', default: '', faIcon: 'fa-arrow-up', hint: 'blank = every row, up to 50000' },
        ],
        run: async ({ api, broadcasterId, msg, config }) => {
          const pollIds = toIdList(firstDefined(msg.pollIds, msg.ids, msg.pollId, msg.id, config.pollIds));
          if (pollIds.length) {
            const polls = await api.polls.getPollsByIds(broadcasterId, pollIds);
            return { data: polls, cursor: null, total: polls.length };
          }

          const limit = clampLimit(firstDefined(msg.limit, config.limit), 20);
          const after = firstDefined(msg.after, msg.cursor);
          const fetchPage = async (cursor?: string) => {
            const res = await api.polls.getPolls(broadcasterId, { limit, after: cursor ?? after });
            return { data: res.data, cursor: res.cursor ?? null, total: res.total };
          };

          const getAll = toBool(firstDefined(msg.all, config.all), false) === true;
          const maxAll = resolveAllMax(firstDefined(msg.allMax, config.allMax));
          const result = getAll ? await fetchAllPages(fetchPage, maxAll) : await fetchPage();

          return { data: result.data, cursor: result.cursor ?? null, total: result.total, truncated: getAll && !!result.cursor };
        },
        map: (result) => result.data.map(mapPoll),
        extra: (result) => ({ pagination: { cursor: result.cursor }, total: result.total, ...(result.truncated ? { truncated: true } : {}) }),
      },
      create: {
        label: 'create',
        help: 'Creates a channel poll with 2 to 5 choices.',
        scopes: ['channel:manage:polls'],
        fields: [
          { name: 'title', label: 'Title', kind: 'string', default: '', primary: true, hint: 'msg.payload overrides this', faIcon: 'fa-bar-chart' },
          { name: 'choices', label: 'Choices', kind: 'string', default: '', hint: 'comma separated, 2 to 5', faIcon: 'fa-list' },
          { name: 'duration', label: 'Duration (s)', kind: 'int', default: '', hint: '15 to 1800, required', faIcon: 'fa-clock-o' },
          { name: 'channelPointsPerVote', label: 'Points per vote', kind: 'int', default: '', hint: 'optional: 0 = disabled', faIcon: 'fa-star' },
        ],
        run: async ({ api, broadcasterId, input, msg, config }) => {
          const title = toStr(input.title);
          if (!title) throw new Error('A poll title is required — set msg.payload or the node title');

          const choices = toStringList(firstDefined(msg.choices, msg.options, config.choices));
          if (choices.length < 2 || choices.length > 5) {
            throw new Error('A poll needs 2 to 5 choices — set msg.choices or the node field');
          }

          const duration = toInt(firstDefined(msg.duration, msg.durationSeconds, config.duration));
          if (duration === undefined || duration < 15 || duration > 1800) {
            throw new Error('A poll duration of 15 to 1800 seconds is required');
          }

          const data: any = { title, choices, duration };
          if (input.channelPointsPerVote !== undefined) data.channelPointsPerVote = input.channelPointsPerVote;

          const poll = await api.polls.createPoll(broadcasterId, data);
          return mapPoll(poll);
        },
      },
      end: {
        label: 'end',
        help: 'Ends an active channel poll, optionally hiding the result from viewers.',
        scopes: ['channel:manage:polls'],
        fields: [
          { name: 'pollId', label: 'Poll ID', kind: 'string', default: '', hint: 'required', faIcon: 'fa-bar-chart' },
          {
            name: 'showResult',
            label: 'Show result',
            kind: 'select',
            default: '',
            faIcon: 'fa-eye',
            options: triState('default (show)', 'show', 'hide'),
          },
        ],
        run: async ({ api, broadcasterId, msg, config }) => {
          const pollId = toStr(firstDefined(msg.pollId, msg.id, config.pollId));
          if (!pollId) throw new Error('A poll ID is required — set msg.pollId or the node field');

          const showResult = toBool(firstDefined(msg.showResult, config.showResult), true) === true;

          const poll = await api.polls.endPoll(broadcasterId, pollId, showResult);
          return mapPoll(poll);
        },
      },
    },
  }),

  defineHelix({
    type: 'twitch-helix-predictions',
    tier: 'extended',
    label: 'predictions',
    help: 'Lists, creates or ends a channel prediction.',
    scopes: ['channel:read:predictions', 'channel:manage:predictions'],
    fields: [broadcaster],
    defaultAction: 'list',
    actions: {
      list: {
        label: 'list',
        help: "Lists a channel's predictions, most recent first, or fetches specific predictions.",
        scopes: ['channel:read:predictions'],
        fields: [
          { name: 'predictionIds', label: 'Prediction IDs', kind: 'idList', default: '', aliases: ['ids', 'predictionId', 'id'], hint: 'optional: comma separated prediction IDs', faIcon: 'fa-trophy' },
          { name: 'limit', label: 'Limit', kind: 'int', default: 20, hint: '1-100', faIcon: 'fa-list-ol' },
          { name: 'all', label: 'Get all', kind: 'bool', default: false, hint: 'follows pages up to the maximum', faIcon: 'fa-download' },
          { name: 'allMax', label: 'Max', kind: 'int', default: '', faIcon: 'fa-arrow-up', hint: 'blank = every row, up to 50000' },
        ],
        run: async ({ api, broadcasterId, msg, config }) => {
          const predictionIds = toIdList(
            firstDefined(msg.predictionIds, msg.ids, msg.predictionId, msg.id, config.predictionIds)
          );
          if (predictionIds.length) {
            const predictions = await api.predictions.getPredictionsByIds(broadcasterId, predictionIds);
            return { data: predictions, cursor: null, total: predictions.length };
          }

          const limit = clampLimit(firstDefined(msg.limit, config.limit), 20);
          const after = firstDefined(msg.after, msg.cursor);
          const fetchPage = async (cursor?: string) => {
            const res = await api.predictions.getPredictions(broadcasterId, { limit, after: cursor ?? after });
            return { data: res.data, cursor: res.cursor ?? null, total: res.total };
          };

          const getAll = toBool(firstDefined(msg.all, config.all), false) === true;
          const maxAll = resolveAllMax(firstDefined(msg.allMax, config.allMax));
          const result = getAll ? await fetchAllPages(fetchPage, maxAll) : await fetchPage();

          return { data: result.data, cursor: result.cursor ?? null, total: result.total, truncated: getAll && !!result.cursor };
        },
        map: (result) => result.data.map(mapPrediction),
        extra: (result) => ({ pagination: { cursor: result.cursor }, total: result.total, ...(result.truncated ? { truncated: true } : {}) }),
      },
      create: {
        label: 'create',
        help: 'Creates a channel prediction with 2 to 10 outcomes.',
        scopes: ['channel:manage:predictions'],
        fields: [
          { name: 'title', label: 'Title', kind: 'string', default: '', primary: true, hint: 'msg.payload overrides this', faIcon: 'fa-trophy' },
          { name: 'outcomes', label: 'Outcomes', kind: 'string', default: '', hint: 'comma separated, 2 to 10', faIcon: 'fa-list' },
          { name: 'autoLockAfter', label: 'Lock after (s)', kind: 'int', default: '', hint: '1 to 1800, required', faIcon: 'fa-clock-o' },
        ],
        run: async ({ api, broadcasterId, input, msg, config }) => {
          const title = toStr(input.title);
          if (!title) throw new Error('A prediction title is required — set msg.payload or the node title');

          const outcomes = toStringList(firstDefined(msg.outcomes, msg.options, config.outcomes));
          if (outcomes.length < 2 || outcomes.length > 10) {
            throw new Error('A prediction needs 2 to 10 outcomes — set msg.outcomes or the node field');
          }

          const autoLockAfter = toInt(firstDefined(msg.autoLockAfter, msg.duration, config.autoLockAfter));
          if (autoLockAfter === undefined || autoLockAfter < 1 || autoLockAfter > 1800) {
            throw new Error('An auto-lock time of 1 to 1800 seconds is required');
          }

          const prediction = await api.predictions.createPrediction(broadcasterId, {
            title,
            outcomes,
            autoLockAfter,
          });
          return mapPrediction(prediction);
        },
      },
      end: {
        label: 'end',
        help: 'Ends a channel prediction by resolving it with a winning outcome or cancelling it.',
        scopes: ['channel:manage:predictions'],
        fields: [
          { name: 'predictionId', label: 'Prediction ID', kind: 'string', default: '', hint: 'required', faIcon: 'fa-trophy' },
          {
            name: 'result',
            label: 'Result',
            kind: 'select',
            default: 'resolve',
            faIcon: 'fa-flag-checkered',
            options: [
              { value: 'resolve', label: 'resolve with a winner' },
              { value: 'cancel', label: 'cancel' },
            ],
          },
          { name: 'outcome', label: 'Winning outcome', kind: 'string', default: '', hint: 'outcome ID or title, required to resolve', faIcon: 'fa-check' },
        ],
        run: async ({ api, broadcasterId, msg, config }) => {
          const predictionId = toStr(firstDefined(msg.predictionId, msg.id, config.predictionId));
          if (!predictionId) {
            throw new Error('A prediction ID is required — set msg.predictionId or the node field');
          }

          const action = (toStr(firstDefined(msg.result, msg.action, config.result)) ?? 'resolve').toLowerCase();
          if (action !== 'resolve' && action !== 'cancel') {
            throw new Error('Prediction result must be either "resolve" or "cancel"');
          }

          if (action === 'cancel') {
            const canceled = await api.predictions.cancelPrediction(broadcasterId, predictionId);
            return mapPrediction(canceled);
          }

          let outcomeId = toStr(firstDefined(msg.outcome, msg.outcomeId, config.outcome));
          if (!outcomeId) {
            throw new Error('An outcome is required to resolve a prediction — set the winning outcome');
          }

          if (!/^\d+$/.test(outcomeId)) {
            const wanted = outcomeId.toLowerCase();
            const prediction = await api.predictions.getPredictionById(broadcasterId, predictionId);
            if (!prediction) throw new Error(`Prediction "${predictionId}" could not be found`);
            const match = (prediction.outcomes ?? []).find(
              (outcome: any) => outcome.id === outcomeId || String(outcome.title).toLowerCase() === wanted
            );
            if (!match) throw new Error(`Outcome "${outcomeId}" was not found on that prediction`);
            outcomeId = match.id;
          }

          const resolved = await api.predictions.resolvePrediction(broadcasterId, predictionId, outcomeId);
          return mapPrediction(resolved);
        },
      },
    },
  }),

defineHelix({
    type: 'twitch-helix-content-classification-labels',
    tier: 'advanced',
    label: 'content classification labels',
    help: "Lists Twitch's content classification labels.",
    scopes: [],
    context: 'app',
    fields: [
      {
        name: 'locale',
        label: 'Locale',
        kind: 'string',
        default: '',
        hint: 'optional: e.g. en-US',
        faIcon: 'fa-globe',
      },
    ],
    run: async ({ api, input }) => api.contentClassificationLabels.getAll(input.locale || undefined),
    map: (label) => ({ id: label.id, name: label.name, description: label.description }),
    extra: (payload) => ({ pagination: { cursor: null }, total: payload.length }),
  }),

  defineHelix({
    type: 'twitch-helix-drops',
    tier: 'advanced',
    label: 'drops',
    help: 'Lists or updates drops entitlements.',
    scopes: [],
    context: 'app',
    fields: [],
    defaultAction: 'list',
    actions: {
      list: {
        label: 'list',
        help: 'Lists drops entitlements by user, game or fulfilment status.',
        scopes: [],
        paged: { limit: 20 },
        fields: [
          {
            name: 'user',
            label: 'User',
            kind: 'user',
            optional: true,
            aliases: ['userId'],
            faIcon: 'fa-search',
            hint: 'filter to one user',
          },
          {
            name: 'game',
            label: 'Game ID',
            kind: 'string',
            default: '',
            aliases: ['gameId'],
            faIcon: 'fa-gamepad',
            hint: 'filter to one game ID',
          },
          {
            name: 'status',
            label: 'Status',
            kind: 'select',
            default: '',
            faIcon: 'fa-filter',
            options: [
              { value: '', label: 'any' },
              { value: 'CLAIMED', label: 'claimed' },
              { value: 'FULFILLED', label: 'fulfilled' },
            ],
          },
        ],
        run: async ({ api, input }) =>
          api.entitlements.getDropsEntitlements(
            {
              user: input.user,
              gameId: input.game || undefined,
              fulfillmentStatus: (input.status || undefined) as any,
              limit: input.limit,
              after: input.after,
            },
            true
          ),
        map: (entitlement) => mapEntitlement(entitlement),
      },
      byIds: {
        label: 'by IDs',
        help: 'Gets drops entitlements by their IDs.',
        scopes: [],
        fields: [
          {
            name: 'ids',
            label: 'Entitlement IDs',
            kind: 'idList',
            default: '',
            aliases: ['entitlementIds'],
            primary: true,
            required: true,
            faIcon: 'fa-tags',
            hint: 'comma separated',
          },
        ],
        run: async ({ api, input, msg }) => {
          const ids = toIdList(input.ids ?? msg.ids);
          if (!ids.length) throw new Error('At least one entitlement ID is required');
          return (await api.entitlements.getDropsEntitlementsByIds(ids)).map(mapEntitlement);
        },
      },
      update: {
        label: 'update',
        help: 'Marks one or more drops entitlements as fulfilled or claimed.',
        scopes: [],
        fields: [
          {
            name: 'ids',
            label: 'Entitlement IDs',
            kind: 'idList',
            default: '',
            aliases: ['entitlementIds'],
            primary: true,
            required: true,
            faIcon: 'fa-tags',
            hint: 'comma separated',
          },
          {
            name: 'status',
            label: 'Status',
            kind: 'select',
            default: 'FULFILLED',
            faIcon: 'fa-check',
            options: [
              { value: 'FULFILLED', label: 'fulfilled' },
              { value: 'CLAIMED', label: 'claimed' },
            ],
          },
        ],
        run: async ({ api, input, msg }) => {
          const ids = toIdList(input.ids ?? msg.ids);
          if (!ids.length) throw new Error('At least one entitlement ID is required');
          const status = (toStr(input.status) ?? 'FULFILLED').toUpperCase() as any;
          const result = await api.entitlements.updateDropsEntitlements(ids, status);
          return [...result].map(([id, outcome]: [string, string]) => ({ id, status: outcome }));
        },
      },
    },
  }),

  defineHelix({
    type: 'twitch-helix-extensions',
    tier: 'advanced',
    label: 'extensions',
    help: 'Reads released extensions, live channels, bits products and transactions.',
    scopes: [],
    context: 'app',
    fields: [],
    defaultAction: 'released',
    actions: {
      released: {
        label: 'get',
        help: 'Gets a released extension, optionally a specific version.',
        scopes: [],
        fields: [
          {
            name: 'extensionId',
            label: 'Extension ID',
            kind: 'string',
            default: '',
            required: true,
            faIcon: 'fa-puzzle-piece',
            hint: 'the extension client id',
          },
          { name: 'version', label: 'Version', kind: 'string', default: '', hint: 'optional' },
        ],
        run: async ({ api, input }) =>
          (getRawData(await api.extensions.getReleasedExtension(input.extensionId, input.version || undefined)) ?? null),
      },
      live: {
        label: 'live channels',
        help: 'Lists the live channels running an extension.',
        scopes: [],
        paged: { limit: 20 },
        fields: [
          {
            name: 'extensionId',
            label: 'Extension ID',
            kind: 'string',
            default: '',
            required: true,
            faIcon: 'fa-puzzle-piece',
          },
        ],
        run: async ({ api, input }) =>
          api.extensions.getLiveChannelsWithExtension(input.extensionId, {
            limit: input.limit,
            after: input.after,
          }),
        map: (channel) => mapChannelReference(channel),
      },
      bits: {
        label: 'bits products',
        help: 'Lists the Bits products of the extension.',
        scopes: [],
        fields: [
          {
            name: 'includeDisabled',
            label: 'Include disabled',
            kind: 'bool',
            default: false,
            faIcon: 'fa-eye',
          },
        ],
        run: async ({ api, input }) =>
          (await api.extensions.getExtensionBitsProducts(input.includeDisabled === true)).map(mapBitsProduct),
        extra: (payload) => ({ pagination: { cursor: null }, total: payload.length }),
      },
      putBits: {
        label: 'put bits product',
        help: 'Creates or updates an extension Bits product.',
        scopes: [],
        fields: [
          { name: 'sku', label: 'SKU', kind: 'string', default: '', required: true, faIcon: 'fa-barcode' },
          { name: 'cost', label: 'Cost (Bits)', kind: 'int', default: '', required: true, faIcon: 'fa-star' },
          { name: 'displayName', label: 'Display name', kind: 'string', default: '', required: true },
          { name: 'inDevelopment', label: 'In development', kind: 'bool', default: false },
          { name: 'broadcast', label: 'Broadcast', kind: 'bool', default: false },
          { name: 'expirationDate', label: 'Expiration', kind: 'string', default: '', hint: 'optional RFC3339 date' },
        ],
        run: async ({ api, input }) => {
          const product = await api.extensions.putExtensionBitsProduct({
            sku: input.sku,
            cost: input.cost,
            displayName: input.displayName,
            inDevelopment: input.inDevelopment === true,
            broadcast: input.broadcast === true,
            expirationDate: toStr(input.expirationDate),
          });
          return mapBitsProduct(product);
        },
      },
      transactions: {
        label: 'transactions',
        help: 'Lists the Bits transactions of an extension.',
        scopes: [],
        paged: { limit: 20 },
        fields: [
          {
            name: 'extensionId',
            label: 'Extension ID',
            kind: 'string',
            default: '',
            required: true,
            faIcon: 'fa-puzzle-piece',
          },
          {
            name: 'transactionIds',
            label: 'Transaction IDs',
            kind: 'idList',
            default: '',
            aliases: ['ids'],
            hint: 'optional: comma separated',
            faIcon: 'fa-hashtag',
          },
        ],
        run: async ({ api, input }) =>
          api.extensions.getExtensionTransactions(input.extensionId, {
            transactionIds: input.transactionIds?.length ? input.transactionIds : undefined,
            limit: input.limit,
            after: input.after,
          }),
        map: (transaction) => mapTransaction(transaction),
      },
    },
  }),

  defineHelix({
    type: 'twitch-helix-user-extensions',
    tier: 'advanced',
    label: 'user extensions',
    help: "Lists the extensions a user has installed or activated.",
    scopes: ['user:read:broadcast'],
    fields: [broadcaster],
    defaultAction: 'installed',
    actions: {
      installed: {
        label: 'installed',
        help: 'Lists the extensions the authenticated user has installed.',
        scopes: ['user:read:broadcast'],
        fields: [
          {
            name: 'withInactive',
            label: 'Include inactive',
            kind: 'bool',
            default: false,
            aliases: ['includeInactive'],
            faIcon: 'fa-eye',
          },
        ],
        run: async ({ api, broadcasterId, input }) =>
          (
            await api.users.getExtensionsForAuthenticatedUser(
              broadcasterId,
              input.withInactive === true
            )
          ).map((extension: any) => getRawData(extension) ?? null),
        extra: (payload) => ({ pagination: { cursor: null }, total: payload.length }),
      },
      active: {
        label: 'active',
        help: 'Gets the active extensions in each slot for the authenticated user.',
        scopes: ['user:read:broadcast'],
        fields: [
          {
            name: 'withDev',
            label: 'Include dev version',
            kind: 'bool',
            default: false,
            faIcon: 'fa-code',
          },
        ],
        run: async ({ api, broadcasterId, input }) =>
          getRawData(await api.users.getActiveExtensions(broadcasterId, input.withDev === true)) ?? null,
      },
    },
  }),
];

const seen = new Set<string>();
for (const spec of HELIX_SPECS) {
  if (seen.has(spec.type)) throw new Error(`Duplicate Helix endpoint type: ${spec.type}`);
  seen.add(spec.type);
}

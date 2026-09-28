import { getRawData } from '@twurple/common';
import { defineHelix } from '../define';
import { broadcaster } from './common';
import {
  firstDefined,
  mapBadgeSet,
  mapChatSettings,
  mapChatter,
  mapEmote,
  mapSentMessage,
  resolveAnnounceColor,
  toBool,
  toInt,
  toStr,
} from '../twitch-helix-utils';

function mapUserEmote(emote: any) {
  return { ...mapEmote(emote), ownerId: emote.ownerId ?? null };
}

function mapSharedChat(session: any) {
  if (!session) return null;
  return {
    sessionId: session.sessionId,
    hostBroadcasterId: session.hostBroadcasterId,
    participants: (session.participants ?? []).map((participant: any) => {
      const raw = (getRawData(participant) ?? {}) as any;
      return {
        broadcasterId: participant.broadcasterId,
        broadcasterLogin: raw.broadcaster_login ?? null,
        broadcasterName: raw.broadcaster_name ?? null,
      };
    }),
    createdDate: session.createdDate,
    updatedDate: session.updatedDate,
  };
}

export const chatSpecs = [
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
    help: 'Sends a shoutout from one channel to another.',
    scopes: ['moderator:manage:shoutouts'],
    fields: [
      {
        name: 'fromBroadcaster',
        label: 'From',
        kind: 'user',
        optional: true,
        aliases: ['from'],
        hint: 'blank = authenticated user',
      },
      {
        name: 'toBroadcaster',
        label: 'Shout out',
        kind: 'user',
        optional: true,
        aliases: ['to'],
        faIcon: 'fa-bullhorn',
        hint: 'channel name or ID to shout out',
      },
    ],
    run: async ({ root, moderatorId, input, raw }) => {
      const fromId = String(input.fromBroadcaster ?? moderatorId);
      const toId = input.toBroadcaster;
      if (!toId) throw new Error('Target broadcaster is required — set msg.to or the node field');

      const toUser = await root.users.getUserById(toId);
      await root.asUser(fromId, (ctx: any) => ctx.chat.shoutoutUser(fromId, toId));

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
            options: [
              { value: '', label: 'leave unchanged' },
              { value: 'true', label: 'on' },
              { value: 'false', label: 'off' },
            ],
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
            options: [
              { value: '', label: 'leave unchanged' },
              { value: 'true', label: 'on' },
              { value: 'false', label: 'off' },
            ],
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
            options: [
              { value: '', label: 'leave unchanged' },
              { value: 'true', label: 'on' },
              { value: 'false', label: 'off' },
            ],
          },
          {
            name: 'emoteOnlyMode',
            label: 'Emote only',
            kind: 'select',
            default: '',
            faIcon: 'fa-smile-o',
            options: [
              { value: '', label: 'leave unchanged' },
              { value: 'true', label: 'on' },
              { value: 'false', label: 'off' },
            ],
          },
          {
            name: 'uniqueChatMode',
            label: 'Unique chat',
            kind: 'select',
            default: '',
            faIcon: 'fa-commenting-o',
            options: [
              { value: '', label: 'leave unchanged' },
              { value: 'true', label: 'on' },
              { value: 'false', label: 'off' },
            ],
          },
          {
            name: 'nonModeratorChatDelay',
            label: 'Non-mod delay',
            kind: 'select',
            default: '',
            faIcon: 'fa-clock-o',
            options: [
              { value: '', label: 'leave unchanged' },
              { value: 'true', label: 'on' },
              { value: 'false', label: 'off' },
            ],
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
      {
        name: 'user',
        label: 'User',
        kind: 'user',
        optional: true,
        aliases: ['userId'],
        hint: 'blank = authenticated user',
        faIcon: 'fa-user',
      },
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
    fields: [
      {
        name: 'broadcaster',
        label: 'Broadcaster',
        kind: 'user',
        optional: true,
        aliases: ['broadcasterId'],
        hint: 'blank = authenticated user',
        faIcon: 'fa-user',
      },
    ],
    run: async ({ api, broadcasterId }) => api.chat.getSharedChatSession(broadcasterId),
    map: (session) => mapSharedChat(session),
  }),
];

import { defineHelix } from '../define';
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

export const chatSpecs = [
  defineHelix({
    type: 'twitch-helix-send-chat-message',
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
      {
        name: 'broadcaster',
        label: 'Broadcaster',
        kind: 'user',
        optional: true,
        hint: 'blank = authenticated user',
      },
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
      {
        name: 'broadcaster',
        label: 'Broadcaster',
        kind: 'user',
        optional: true,
        hint: 'blank = authenticated user',
      },
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
    type: 'twitch-helix-get-chatters',
    label: 'get chatters',
    help: "Lists the users currently in a channel's chat.",
    scopes: ['moderator:read:chatters'],
    paged: { limit: 20, max: 1000 },
    fields: [
      {
        name: 'broadcaster',
        label: 'Broadcaster',
        kind: 'user',
        optional: true,
        hint: 'blank = authenticated user',
      },
    ],
    run: async ({ api, broadcasterId, input }) =>
      api.chat.getChatters(broadcasterId, { limit: input.limit, after: input.after }),
    map: mapChatter,
  }),

  defineHelix({
    type: 'twitch-helix-get-chat-settings',
    label: 'get chat settings',
    help: "Gets a channel's chat settings, including the non-moderator delay.",
    scopes: [],
    fields: [
      {
        name: 'broadcaster',
        label: 'Broadcaster',
        kind: 'user',
        optional: true,
        hint: 'blank = authenticated user',
      },
    ],
    run: async ({ api, broadcasterId }) => api.chat.getSettingsPrivileged(broadcasterId),
    map: (settings) => mapChatSettings(settings, true),
  }),

  defineHelix({
    type: 'twitch-helix-update-chat-settings',
    label: 'update chat settings',
    help: 'Changes only the chat settings you set, leaving the rest unchanged.',
    scopes: ['moderator:manage:chat_settings'],
    fields: [
      {
        name: 'broadcaster',
        label: 'Broadcaster',
        kind: 'user',
        optional: true,
        hint: 'blank = authenticated user',
      },
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
  }),

  defineHelix({
    type: 'twitch-helix-clear-chat',
    label: 'clear chat',
    help: "Clears every message from a channel's chat.",
    scopes: ['moderator:manage:chat_messages'],
    fields: [
      {
        name: 'broadcaster',
        label: 'Broadcaster',
        kind: 'user',
        optional: true,
        hint: 'blank = authenticated user',
      },
    ],
    run: async ({ api, broadcasterId }) => {
      await api.moderation.deleteChatMessages(broadcasterId);
      return { broadcasterId, cleared: true };
    },
  }),

  defineHelix({
    type: 'twitch-helix-delete-chat-message',
    label: 'delete chat message',
    help: 'Deletes one chat message.',
    scopes: ['moderator:manage:chat_messages'],
    fields: [
      {
        name: 'messageId',
        label: 'Message ID',
        kind: 'string',
        default: '',
        faIcon: 'fa-comment-o',
        hint: 'msg.messageId or msg.id overrides this',
      },
      {
        name: 'broadcaster',
        label: 'Broadcaster',
        kind: 'user',
        optional: true,
        hint: 'blank = authenticated user',
      },
    ],
    run: async ({ api, broadcasterId, input, msg }) => {
      const messageId = input.messageId ?? toStr(msg.id);
      if (!messageId) throw new Error('Message ID is required — set msg.messageId or msg.id');

      await api.moderation.deleteChatMessages(broadcasterId, messageId);
      return { broadcasterId, messageId, deleted: true };
    },
  }),

  defineHelix({
    type: 'twitch-helix-get-emotes',
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
      {
        name: 'broadcaster',
        label: 'Broadcaster',
        kind: 'user',
        optional: true,
        hint: 'blank = authenticated user',
      },
    ],
    run: async ({ api, broadcasterId, input }) => {
      if (input.source === 'global') {
        return (await api.chat.getGlobalEmotes()).map(mapEmote);
      }
      return (await api.chat.getChannelEmotes(broadcasterId)).map(mapEmote);
    },
  }),

  defineHelix({
    type: 'twitch-helix-get-chat-badges',
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
      {
        name: 'broadcaster',
        label: 'Broadcaster',
        kind: 'user',
        optional: true,
        hint: 'blank = authenticated user',
      },
    ],
    run: async ({ api, broadcasterId, input }) => {
      if (input.source === 'global') {
        return (await api.chat.getGlobalBadges()).map(mapBadgeSet);
      }
      return (await api.chat.getChannelBadges(broadcasterId)).map(mapBadgeSet);
    },
  }),
];
